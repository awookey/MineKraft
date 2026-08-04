'use strict'

const WOOD_JOB_STATE = Object.freeze({
  PREPARE: 'PREPARE',
  SAFETY_CHECK: 'SAFETY_CHECK',
  REGROUP_OWNER: 'REGROUP_OWNER',
  SCAN_LOCAL_WOOD: 'SCAN_LOCAL_WOOD',
  APPROACH_TARGET: 'APPROACH_TARGET',
  DIG_TARGET: 'DIG_TARGET',
  BLOCKED: 'BLOCKED',
  COMPLETE: 'COMPLETE',
  CANCELLED: 'CANCELLED'
})

const DEFAULT_TARGET_RETRIES = 2
const DEFAULT_BLACKLIST_MS = 30_000
const DEFAULT_TARGET_LIFETIME_FAILURES = 4
const DEFAULT_JOB_FAILURE_LIMIT = 12

function finiteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function positionKey(position) {
  if (!position) return null
  const x = Math.floor(finiteNumber(position.x))
  const y = Math.floor(finiteNumber(position.y))
  const z = Math.floor(finiteNumber(position.z))
  return `${x},${y},${z}`
}

function createWoodJob({ owner, amount, baseline = 0, now = Date.now(), id } = {}) {
  const cleanOwner = String(owner || '').trim()
  if (!cleanOwner) throw new Error('wood job owner is required')

  const requested = Math.max(1, Math.floor(finiteNumber(amount, 1)))
  const startedAt = finiteNumber(now, Date.now())
  const jobId = String(id || `wood-${startedAt.toString(36)}`)

  return {
    id: jobId,
    kind: 'wood',
    target: 'wood',
    item: 'wood-like',
    amount: requested,
    owner: cleanOwner,
    goal: `mine ${requested} wood`,
    startedAt,
    inventoryBaseline: Math.max(0, Math.floor(finiteNumber(baseline))),
    state: WOOD_JOB_STATE.PREPARE,
    stateUpdatedAt: startedAt,
    blockedReason: null,
    targetBlockPos: null,
    targetTreeId: null,
    treeLockId: null,
    treeKnownPositions: [],
    targetAttempts: {},
    lifetimeTargetFailures: {},
    blacklistUntil: {},
    permanentBlacklist: {},
    approachTicks: 0,
    targetGeneration: 0,
    totalFailures: 0,
    hardBlockedReason: null,
    axeUpgradeAttempted: false,
    lastProgress: 0
  }
}

function setWoodJobState(job, state, { reason = null, now = Date.now() } = {}) {
  if (!job) return null
  if (!Object.values(WOOD_JOB_STATE).includes(state)) throw new Error(`unknown wood job state: ${state}`)
  job.state = state
  job.stateUpdatedAt = finiteNumber(now, Date.now())
  job.blockedReason = state === WOOD_JOB_STATE.BLOCKED ? String(reason || 'blocked') : null
  return job
}

function woodInventoryCount(items = [], isWoodLike = () => false) {
  return (items || [])
    .filter(item => item && isWoodLike(item.name))
    .reduce((sum, item) => sum + Math.max(0, Math.floor(finiteNumber(item.count))), 0)
}

function woodJobProgress(job, currentCount) {
  if (!job) return 0
  return Math.max(0, Math.floor(finiteNumber(currentCount)) - Math.max(0, Math.floor(finiteNumber(job.inventoryBaseline))))
}

function isWoodJobComplete(job, currentCount) {
  return !!job && woodJobProgress(job, currentCount) >= job.amount
}

function woodOperationToken(job) {
  if (!job) return null
  return {
    jobId: job.id,
    targetKey: job.targetBlockPos,
    generation: Math.max(0, Math.floor(finiteNumber(job.targetGeneration)))
  }
}

function woodOperationIsCurrent(job, token) {
  return !!job && !!token &&
    job.id === token.jobId &&
    job.targetBlockPos === token.targetKey &&
    Math.max(0, Math.floor(finiteNumber(job.targetGeneration))) === token.generation &&
    ![WOOD_JOB_STATE.CANCELLED, WOOD_JOB_STATE.COMPLETE].includes(job.state)
}

function woodJobGuardDecision({ hazard = null, ownerAvailable = false, ownerDistance = Infinity, maxRadius = 48 } = {}) {
  if (hazard) return { state: WOOD_JOB_STATE.BLOCKED, reason: String(hazard) }
  if (!ownerAvailable) return { state: WOOD_JOB_STATE.BLOCKED, reason: 'owner-unavailable' }
  if (finiteNumber(ownerDistance, Infinity) > finiteNumber(maxRadius, 48)) {
    return { state: WOOD_JOB_STATE.REGROUP_OWNER, reason: 'outside-owner-radius' }
  }
  return { state: WOOD_JOB_STATE.SCAN_LOCAL_WOOD, reason: null }
}

function woodJobStartDecision({ hasActiveJob = false, inventoryTransferCount = 0, backgroundActionBusy = false } = {}) {
  if (hasActiveJob) return { ok: false, reason: 'active-job' }
  if (backgroundActionBusy) return { ok: false, reason: 'background-action-busy' }
  if (Math.max(0, Math.floor(finiteNumber(inventoryTransferCount))) > 0) {
    return { ok: false, reason: 'inventory-transfer-active' }
  }
  return { ok: true, reason: null }
}

function woodJobBlocksCommand(command, args = []) {
  const name = String(command || '').toLowerCase()
  const sub = String(args[0] || '').toLowerCase()
  const actionCommands = new Set([
    'follow', 'come', 'stay', 'guard', 'gather', 'craft', 'build', 'task',
    'deposit', 'stash', 'chest'
  ])
  if (actionCommands.has(name)) return true
  if (name === 'pvp' && sub === 'on') return true
  if (name === 'auto' && ['on', 'mine', 'craft', 'build', 'gather'].includes(sub)) return true
  return false
}

function woodThreatReason(hostiles = []) {
  const nearby = (hostiles || []).filter(Boolean)
  if (!nearby.length) return null
  if (nearby.some(entity => entity.name === 'creeper' && finiteNumber(entity.distance, Infinity) < 5)) {
    return 'creeper-close'
  }
  if (nearby.length >= 3) return 'hostile-swarm'
  return `hostile-nearby:${nearby[0].name || 'unknown'}`
}

function woodSafetyHazard({ health = 20, inWater = false, inLava = false, lowBreath = false, onFire = false, threatReason = null } = {}) {
  if (finiteNumber(health, 20) <= 10) return 'low-health'
  if (inLava) return 'lava-risk'
  if (onFire) return 'fire-risk'
  if (inWater || lowBreath) return 'water-risk'
  return threatReason || null
}

function inventoryCanAcceptItem({ emptySlots = 0, items = [], itemName = '', stackSize = 64, amount = 1 } = {}) {
  if (Math.max(0, Math.floor(finiteNumber(emptySlots))) > 0) return true
  const needed = Math.max(1, Math.floor(finiteNumber(amount, 1)))
  const maximum = Math.max(1, Math.floor(finiteNumber(stackSize, 64)))
  return (items || []).some(item => item?.name === itemName && finiteNumber(item.count) + needed <= maximum)
}

function woodTargetNeedsApproach({ distance = Infinity, diggable = false, approachDistance = 2.2 } = {}) {
  return !diggable && finiteNumber(distance, Infinity) > finiteNumber(approachDistance, 2.2)
}

function normalizeCandidate(candidate) {
  const position = candidate?.position || candidate?.block?.position
  const key = candidate?.key || positionKey(position)
  if (!key || !position) return null
  return {
    ...candidate,
    position: {
      x: Math.floor(finiteNumber(position.x)),
      y: Math.floor(finiteNumber(position.y)),
      z: Math.floor(finiteNumber(position.z))
    },
    key
  }
}

function areConnected(a, b) {
  const dx = Math.abs(a.position.x - b.position.x)
  const dy = Math.abs(a.position.y - b.position.y)
  const dz = Math.abs(a.position.z - b.position.z)
  return dx + dy + dz === 1
}

function clusterWoodCandidates(candidates = []) {
  const nodes = candidates.map(normalizeCandidate).filter(Boolean)
  const byKey = new Map(nodes.map(node => [node.key, node]))
  const visited = new Set()
  const result = []

  for (const node of nodes) {
    if (visited.has(node.key)) continue
    const component = []
    const queue = [node]
    visited.add(node.key)

    while (queue.length) {
      const current = queue.shift()
      component.push(current)
      const neighbours = [
        [1, 0, 0], [-1, 0, 0], [0, 1, 0],
        [0, -1, 0], [0, 0, 1], [0, 0, -1]
      ]
      for (const [dx, dy, dz] of neighbours) {
        const key = `${current.position.x + dx},${current.position.y + dy},${current.position.z + dz}`
        const next = byKey.get(key)
        if (!next || visited.has(key) || !areConnected(current, next)) continue
        visited.add(key)
        queue.push(next)
      }
    }

    const root = [...component].sort((a, b) =>
      a.position.y - b.position.y ||
      a.position.x - b.position.x ||
      a.position.z - b.position.z
    )[0]
    const treeId = `tree:${root.position.x},${root.position.z}`
    const treeMemberKeys = component.map(member => member.key).sort()
    for (const member of component) result.push({ ...member, treeId, treeMemberKeys })
  }

  return result
}

function stabilizeWoodTreeLock(job, candidates = []) {
  const known = new Set(job?.treeKnownPositions || [])
  if (!job?.treeLockId || !known.size) return candidates

  const matchingComponentIds = new Set()
  for (const candidate of candidates) {
    if ((candidate.treeMemberKeys || []).some(key => known.has(key))) matchingComponentIds.add(candidate.treeId)
  }
  if (!matchingComponentIds.size) return candidates

  const expanded = new Set(known)
  for (const candidate of candidates) {
    if (!matchingComponentIds.has(candidate.treeId)) continue
    for (const key of candidate.treeMemberKeys || []) expanded.add(key)
  }
  job.treeKnownPositions = [...expanded]
  return candidates.map(candidate => matchingComponentIds.has(candidate.treeId)
    ? { ...candidate, treeId: job.treeLockId }
    : candidate)
}

function isTargetBlacklisted(job, key, now = Date.now()) {
  if (!job || !key) return false
  if (job.permanentBlacklist?.[key]) return true
  const until = finiteNumber(job.blacklistUntil?.[key])
  if (!until) return false
  if (until <= now) {
    delete job.blacklistUntil[key]
    delete job.targetAttempts[key]
    return false
  }
  return true
}

function chooseWoodTarget(job, candidates = [], now = Date.now()) {
  if (job?.hardBlockedReason) return null
  const viable = candidates
    .map(normalizeCandidate)
    .filter(Boolean)
    .filter(candidate => candidate.reachable !== false)
    .filter(candidate => !isTargetBlacklisted(job, candidate.key, now))

  if (!viable.length) return null

  viable.sort((a, b) => {
    const aCurrent = a.key === job?.targetBlockPos ? 0 : 1
    const bCurrent = b.key === job?.targetBlockPos ? 0 : 1
    if (aCurrent !== bCurrent) return aCurrent - bCurrent

    const aLocked = job?.treeLockId && a.treeId === job.treeLockId ? 0 : 1
    const bLocked = job?.treeLockId && b.treeId === job.treeLockId ? 0 : 1
    if (aLocked !== bLocked) return aLocked - bLocked

    if (a.visible !== b.visible) return a.visible ? -1 : 1
    return a.position.y - b.position.y ||
      finiteNumber(a.anchorDistance, Infinity) - finiteNumber(b.anchorDistance, Infinity) ||
      finiteNumber(a.botDistance, Infinity) - finiteNumber(b.botDistance, Infinity) ||
      a.key.localeCompare(b.key)
  })

  return viable[0]
}

function assignWoodTarget(job, candidate, now = Date.now()) {
  if (!job || !candidate) return null
  job.targetBlockPos = candidate.key || positionKey(candidate.position || candidate.block?.position)
  job.targetTreeId = candidate.treeId || null
  if (candidate.treeId) {
    if (job.treeLockId === candidate.treeId) {
      job.treeKnownPositions = [...new Set([...(job.treeKnownPositions || []), ...(candidate.treeMemberKeys || [])])]
    } else {
      job.treeLockId = candidate.treeId
      job.treeKnownPositions = [...new Set(candidate.treeMemberKeys || [job.targetBlockPos])]
    }
  }
  job.approachTicks = 0
  job.targetGeneration = Math.max(0, Math.floor(finiteNumber(job.targetGeneration))) + 1
  setWoodJobState(job, WOOD_JOB_STATE.APPROACH_TARGET, { now })
  return job.targetBlockPos
}

function clearWoodTarget(job) {
  if (!job) return
  job.targetBlockPos = null
  job.targetTreeId = null
  job.approachTicks = 0
  job.targetGeneration = Math.max(0, Math.floor(finiteNumber(job.targetGeneration))) + 1
}

function recordWoodTargetFailure(job, key, {
  reason = 'target-failed',
  now = Date.now(),
  maxRetries = DEFAULT_TARGET_RETRIES,
  blacklistMs = DEFAULT_BLACKLIST_MS,
  maxLifetimeFailures = DEFAULT_TARGET_LIFETIME_FAILURES,
  maxJobFailures = DEFAULT_JOB_FAILURE_LIMIT
} = {}) {
  if (!job || !key) return { attempts: 0, lifetimeAttempts: 0, blacklisted: false, targetExhausted: false, jobExhausted: false }
  const attempts = Math.max(0, Math.floor(finiteNumber(job.targetAttempts?.[key]))) + 1
  const lifetimeAttempts = Math.max(0, Math.floor(finiteNumber(job.lifetimeTargetFailures?.[key]))) + 1
  job.targetAttempts[key] = attempts
  job.lifetimeTargetFailures[key] = lifetimeAttempts
  job.totalFailures = Math.max(0, Math.floor(finiteNumber(job.totalFailures))) + 1

  const targetExhausted = lifetimeAttempts >= maxLifetimeFailures
  const jobExhausted = job.totalFailures >= maxJobFailures
  const blacklisted = attempts >= maxRetries || targetExhausted
  if (targetExhausted) job.permanentBlacklist[key] = String(reason)
  else if (blacklisted) job.blacklistUntil[key] = finiteNumber(now, Date.now()) + Math.max(1, finiteNumber(blacklistMs, DEFAULT_BLACKLIST_MS))
  if (jobExhausted) job.hardBlockedReason = `failure-budget-exhausted:${reason}`

  clearWoodTarget(job)
  setWoodJobState(job, WOOD_JOB_STATE.BLOCKED, { reason: job.hardBlockedReason || reason, now })
  return { attempts, lifetimeAttempts, blacklisted, targetExhausted, jobExhausted }
}

function recordWoodTargetSuccess(job, candidate, now = Date.now()) {
  if (!job) return
  const key = candidate?.key || positionKey(candidate?.position || candidate?.block?.position) || job.targetBlockPos
  if (key) {
    delete job.targetAttempts[key]
    delete job.lifetimeTargetFailures[key]
    delete job.blacklistUntil[key]
    delete job.permanentBlacklist[key]
  }
  if (candidate?.treeId) job.treeLockId = candidate.treeId
  clearWoodTarget(job)
  job.blockedReason = null
  setWoodJobState(job, WOOD_JOB_STATE.SCAN_LOCAL_WOOD, { now })
}

function cancelWoodJob(job, requester, { isAdmin = false, now = Date.now() } = {}) {
  if (!job) return { ok: false, reason: 'no-active-job' }
  if (requester !== job.owner && !isAdmin) return { ok: false, reason: 'not-job-owner' }
  job.targetGeneration = Math.max(0, Math.floor(finiteNumber(job.targetGeneration))) + 1
  setWoodJobState(job, WOOD_JOB_STATE.CANCELLED, { now })
  return { ok: true }
}

module.exports = {
  WOOD_JOB_STATE,
  DEFAULT_TARGET_RETRIES,
  DEFAULT_BLACKLIST_MS,
  DEFAULT_TARGET_LIFETIME_FAILURES,
  DEFAULT_JOB_FAILURE_LIMIT,
  positionKey,
  createWoodJob,
  setWoodJobState,
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
  woodTargetNeedsApproach,
  clusterWoodCandidates,
  stabilizeWoodTreeLock,
  isTargetBlacklisted,
  chooseWoodTarget,
  assignWoodTarget,
  clearWoodTarget,
  recordWoodTargetFailure,
  recordWoodTargetSuccess,
  cancelWoodJob
}
