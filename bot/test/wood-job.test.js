'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  WOOD_JOB_STATE,
  createWoodJob,
  woodInventoryCount,
  woodJobProgress,
  isWoodJobComplete,
  woodOperationToken,
  woodOperationIsCurrent,
  woodJobGuardDecision,
  woodJobStartDecision,
  woodJobBlocksCommand,
  woodThreatReason,
  woodSafetyHazard,
  inventoryCanAcceptItem,
  clusterWoodCandidates,
  chooseWoodTarget,
  assignWoodTarget,
  recordWoodTargetFailure,
  recordWoodTargetSuccess,
  isTargetBlacklisted,
  cancelWoodJob
} = require('../lib/wood-job')

const isWoodLike = name => {
  const value = String(name || '')
  return !value.startsWith('stripped_') && (value.endsWith('_log') || value.endsWith('_stem'))
}

function candidate(x, y, z, extra = {}) {
  return {
    position: { x, y, z },
    anchorDistance: Math.hypot(x, z),
    botDistance: Math.hypot(x, z),
    reachable: true,
    ...extra
  }
}

test('progress is relative to the inventory baseline', () => {
  const job = createWoodJob({ owner: 'Wookey', amount: 4, baseline: 12, now: 100, id: 'wood-test' })
  assert.equal(woodJobProgress(job, 12), 0)
  assert.equal(woodJobProgress(job, 15), 3)
  assert.equal(isWoodJobComplete(job, 15), false)
  assert.equal(isWoodJobComplete(job, 16), true)
  assert.equal(woodJobProgress(job, 10), 0, 'inventory loss cannot create negative progress')
})

test('wood inventory counting supports mixed species and excludes processed blocks', () => {
  const count = woodInventoryCount([
    { name: 'oak_log', count: 2 },
    { name: 'birch_log', count: 3 },
    { name: 'crimson_stem', count: 4 },
    { name: 'stripped_oak_log', count: 8 },
    { name: 'oak_planks', count: 16 }
  ], isWoodLike)
  assert.equal(count, 9)
})

test('wood jobs require an explicit owner and carry a stable id', () => {
  assert.throws(() => createWoodJob({ amount: 2 }), /owner is required/)
  const job = createWoodJob({ owner: 'Wookey', amount: 2, baseline: 0, now: 1234, id: 'wood-fixed' })
  assert.equal(job.id, 'wood-fixed')
  assert.equal(job.owner, 'Wookey')
  assert.equal(job.state, WOOD_JOB_STATE.PREPARE)
})

test('wood job start waits for inventory transfers and survival actions', () => {
  assert.deepEqual(woodJobStartDecision({ inventoryTransferCount: 1 }), {
    ok: false,
    reason: 'inventory-transfer-active'
  })
  assert.deepEqual(woodJobStartDecision({ backgroundActionBusy: true }), {
    ok: false,
    reason: 'background-action-busy'
  })
  assert.deepEqual(woodJobStartDecision({ inventoryTransferCount: 0, backgroundActionBusy: false }), {
    ok: true,
    reason: null
  })
})

test('wood action ownership centrally blocks mutating commands but permits status and cancellation', () => {
  for (const command of ['follow', 'come', 'stay', 'guard', 'gather', 'craft', 'build', 'task', 'deposit', 'stash', 'chest']) {
    assert.equal(woodJobBlocksCommand(command), true, `${command} must be blocked`)
  }
  assert.equal(woodJobBlocksCommand('pvp', ['on']), true)
  assert.equal(woodJobBlocksCommand('auto', ['mine']), true)
  assert.equal(woodJobBlocksCommand('auto', ['status']), false)
  assert.equal(woodJobBlocksCommand('auto', ['cancel']), false)
  assert.equal(woodJobBlocksCommand('inventory'), false)
})

test('wood threat policy prioritises close creepers, swarms, and nearby hostiles', () => {
  assert.equal(woodThreatReason([]), null)
  assert.equal(woodThreatReason([{ name: 'zombie', distance: 6 }]), 'hostile-nearby:zombie')
  assert.equal(woodThreatReason([
    { name: 'zombie', distance: 6 },
    { name: 'skeleton', distance: 7 },
    { name: 'spider', distance: 4 }
  ]), 'hostile-swarm')
  assert.equal(woodThreatReason([
    { name: 'zombie', distance: 2 },
    { name: 'creeper', distance: 4.5 }
  ]), 'creeper-close')
})

test('wood safety policy keeps health, fire, lava, water, and hostile interruption active', () => {
  assert.equal(woodSafetyHazard({ health: 10 }), 'low-health')
  assert.equal(woodSafetyHazard({ inLava: true }), 'lava-risk')
  assert.equal(woodSafetyHazard({ onFire: true }), 'fire-risk')
  assert.equal(woodSafetyHazard({ inWater: true }), 'water-risk')
  assert.equal(woodSafetyHazard({ lowBreath: true }), 'water-risk')
  assert.equal(woodSafetyHazard({ threatReason: 'creeper-close' }), 'creeper-close')
  assert.equal(woodSafetyHazard(), null)
})

test('wood jobs block when neither an empty slot nor compatible stack capacity remains', () => {
  assert.equal(inventoryCanAcceptItem({ emptySlots: 1, itemName: 'oak_log', items: [] }), true)
  assert.equal(inventoryCanAcceptItem({ emptySlots: 0, itemName: 'oak_log', items: [{ name: 'oak_log', count: 63 }], stackSize: 64 }), true)
  assert.equal(inventoryCanAcceptItem({ emptySlots: 0, itemName: 'oak_log', items: [{ name: 'oak_log', count: 64 }], stackSize: 64 }), false)
  assert.equal(inventoryCanAcceptItem({ emptySlots: 0, itemName: 'oak_log', items: [{ name: 'birch_log', count: 1 }], stackSize: 64 }), false)
})

test('owner and radius guards block or regroup deterministically', () => {
  assert.deepEqual(woodJobGuardDecision({ ownerAvailable: false }), {
    state: WOOD_JOB_STATE.BLOCKED,
    reason: 'owner-unavailable'
  })
  assert.deepEqual(woodJobGuardDecision({ ownerAvailable: true, ownerDistance: 49, maxRadius: 48 }), {
    state: WOOD_JOB_STATE.REGROUP_OWNER,
    reason: 'outside-owner-radius'
  })
  assert.deepEqual(woodJobGuardDecision({ ownerAvailable: true, ownerDistance: 10, maxRadius: 48 }), {
    state: WOOD_JOB_STATE.SCAN_LOCAL_WOOD,
    reason: null
  })
  assert.deepEqual(woodJobGuardDecision({ hazard: 'water-risk', ownerAvailable: true, ownerDistance: 1 }), {
    state: WOOD_JOB_STATE.BLOCKED,
    reason: 'water-risk'
  })
})

test('cancellation and target replacement invalidate in-flight operation tokens', () => {
  const job = createWoodJob({ owner: 'Wookey', amount: 2, id: 'wood-operation-token' })
  const targets = clusterWoodCandidates([candidate(2, 64, 0), candidate(6, 64, 0)])
  assignWoodTarget(job, targets[0], 100)
  const firstToken = woodOperationToken(job)
  assert.equal(woodOperationIsCurrent(job, firstToken), true)

  assignWoodTarget(job, targets[1], 110)
  assert.equal(woodOperationIsCurrent(job, firstToken), false)
  const secondToken = woodOperationToken(job)
  assert.equal(cancelWoodJob(job, 'Wookey').ok, true)
  assert.equal(woodOperationIsCurrent(job, secondToken), false)
})

test('only the owner or an administrator can cancel a wood job', () => {
  const strangerJob = createWoodJob({ owner: 'Wookey', amount: 2, id: 'wood-owner-test' })
  assert.deepEqual(cancelWoodJob(strangerJob, 'OtherPlayer'), { ok: false, reason: 'not-job-owner' })
  assert.notEqual(strangerJob.state, WOOD_JOB_STATE.CANCELLED)

  assert.deepEqual(cancelWoodJob(strangerJob, 'Admin', { isAdmin: true }), { ok: true })
  assert.equal(strangerJob.state, WOOD_JOB_STATE.CANCELLED)
})

test('connected logs receive a stable tree id and the active tree remains preferred', () => {
  const clustered = clusterWoodCandidates([
    candidate(1, 64, 1),
    candidate(1, 65, 1),
    candidate(6, 64, 0),
    candidate(6, 65, 0)
  ])
  const firstTree = clustered.filter(item => item.position.x === 1)
  const secondTree = clustered.filter(item => item.position.x === 6)
  assert.equal(new Set(firstTree.map(item => item.treeId)).size, 1)
  assert.equal(new Set(secondTree.map(item => item.treeId)).size, 1)
  assert.notEqual(firstTree[0].treeId, secondTree[0].treeId)
  assert.equal(clusterWoodCandidates([candidate(1, 65, 1)])[0].treeId, firstTree[0].treeId, 'tree id survives removal of the lowest log')

  const job = createWoodJob({ owner: 'Wookey', amount: 4, id: 'wood-tree-lock' })
  job.treeLockId = secondTree[0].treeId
  assert.equal(chooseWoodTarget(job, clustered).treeId, secondTree[0].treeId)
})

test('visible targets win over hidden targets when no tree is locked', () => {
  const job = createWoodJob({ owner: 'Wookey', amount: 4, id: 'wood-visible' })
  const hidden = candidate(1, 64, 0, { visible: false })
  const visible = candidate(3, 64, 0, { visible: true })
  assert.equal(chooseWoodTarget(job, clusterWoodCandidates([hidden, visible])).position.x, 3)
})

test('the current viable target remains stable across rescans', () => {
  const job = createWoodJob({ owner: 'Wookey', amount: 4, id: 'wood-persistent' })
  const candidates = clusterWoodCandidates([
    candidate(2, 64, 0),
    candidate(5, 64, 0)
  ])
  const farther = candidates.find(item => item.position.x === 5)
  assignWoodTarget(job, farther, 100)
  assert.equal(chooseWoodTarget(job, candidates, 101).key, farther.key)
})

test('target failures are bounded and lead to temporary blacklisting', () => {
  const job = createWoodJob({ owner: 'Wookey', amount: 4, id: 'wood-retry' })
  const target = clusterWoodCandidates([candidate(2, 64, 0)])[0]
  assignWoodTarget(job, target, 100)

  const first = recordWoodTargetFailure(job, target.key, { now: 110, maxRetries: 2, blacklistMs: 50 })
  assert.deepEqual(first, {
    attempts: 1,
    lifetimeAttempts: 1,
    blacklisted: false,
    targetExhausted: false,
    jobExhausted: false
  })
  assert.equal(isTargetBlacklisted(job, target.key, 110), false)

  const second = recordWoodTargetFailure(job, target.key, { now: 120, maxRetries: 2, blacklistMs: 50 })
  assert.deepEqual(second, {
    attempts: 2,
    lifetimeAttempts: 2,
    blacklisted: true,
    targetExhausted: false,
    jobExhausted: false
  })
  assert.equal(isTargetBlacklisted(job, target.key, 150), true)
  assert.equal(chooseWoodTarget(job, [target], 150), null)
  assert.equal(isTargetBlacklisted(job, target.key, 171), false)
})

test('lifetime target and job failure budgets prevent infinite retry cycles', () => {
  const job = createWoodJob({ owner: 'Wookey', amount: 4, id: 'wood-hard-budget' })
  const target = clusterWoodCandidates([candidate(2, 64, 0)])[0]

  for (let attempt = 1; attempt <= 4; attempt++) {
    recordWoodTargetFailure(job, target.key, {
      now: 100 + attempt,
      maxRetries: 1,
      blacklistMs: 1,
      maxLifetimeFailures: 4,
      maxJobFailures: 12
    })
  }
  assert.equal(job.permanentBlacklist[target.key], 'target-failed')
  assert.equal(isTargetBlacklisted(job, target.key, Number.MAX_SAFE_INTEGER), true)
  assert.equal(chooseWoodTarget(job, [target], Number.MAX_SAFE_INTEGER), null)

  const secondJob = createWoodJob({ owner: 'Wookey', amount: 4, id: 'wood-job-budget' })
  recordWoodTargetFailure(secondJob, target.key, { maxJobFailures: 2 })
  const exhausted = recordWoodTargetFailure(secondJob, target.key, { maxJobFailures: 2 })
  assert.equal(exhausted.jobExhausted, true)
  assert.match(secondJob.hardBlockedReason, /^failure-budget-exhausted:/)
  assert.equal(chooseWoodTarget(secondJob, [target]), null)
})

test('a successful dig clears target failure state while retaining the tree lock', () => {
  const job = createWoodJob({ owner: 'Wookey', amount: 4, id: 'wood-success' })
  const target = clusterWoodCandidates([candidate(2, 64, 0)])[0]
  assignWoodTarget(job, target, 100)
  recordWoodTargetFailure(job, target.key, { now: 110, maxRetries: 3 })
  assignWoodTarget(job, target, 120)
  recordWoodTargetSuccess(job, target, 130)

  assert.equal(job.targetBlockPos, null)
  assert.equal(job.targetAttempts[target.key], undefined)
  assert.equal(job.treeLockId, target.treeId)
  assert.equal(job.state, WOOD_JOB_STATE.SCAN_LOCAL_WOOD)
})
