require('dotenv').config({ path: '../.env' })

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const mineflayer = require('mineflayer')
const { Titles } = require('prismarine-auth')
const { pathfinder, goals, Movements } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const pvp = require('mineflayer-pvp').plugin

const dataDir = path.join(__dirname, 'data')
const profilePath = path.join(dataDir, 'profiles.json')
const worldStatePath = path.join(dataDir, 'world-state.json')
const skillsPath = path.join(dataDir, 'skills.json')

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
if (!fs.existsSync(profilePath)) fs.writeFileSync(profilePath, JSON.stringify({}, null, 2))
if (!fs.existsSync(worldStatePath)) fs.writeFileSync(worldStatePath, JSON.stringify({ parties: {} }, null, 2))
if (!fs.existsSync(skillsPath)) fs.writeFileSync(skillsPath, JSON.stringify({}, null, 2))

const cfg = {
  host: process.env.MC_HOST || 'minecraft',
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_BOT_USERNAME || 'SilasBot',
  auth: process.env.MC_AUTH || 'microsoft',
  authFlow: process.env.MC_AUTH_FLOW || 'live',
  mode: process.env.SILAS_MODE || 'family', // family | mayhem
  adminUsers: (process.env.SILAS_ADMIN_USERS || '').split(',').map(s => s.trim()).filter(Boolean)
}

let bot
let activeMode = cfg.mode
let followTarget = null
let guardTarget = null
let eventTicker = null
let safetyTicker = null
let mcDataRef = null
let spawnPosition = null
const recentPositions = []
let lastStuckNudgeAt = 0
let lastWeaponBootstrapAt = 0
let lastCombatRetreatAt = 0
let combatRearmAt = 0

const autoState = {
  enabled: false,
  job: null,
  busy: false,
  lastSayAt: 0,
  maxRadius: 48,
  placedCraftingTablePos: null,
  placedChestPos: null,
  currentStep: null,
  lastError: null,
  lastSuccess: null,
  keepDaytime: true,
  lastDaytimeSetAt: 0
}

const classes = ['builder', 'scout', 'tank', 'alchemist']

const questTemplatesByType = {
  mining: [
    {
      id: 'starter_ore_run',
      name: 'Starter Ore Run',
      stages: ['Bring 16 cobblestone', 'Bring 8 coal', 'Smelt 8 iron ingots'],
      rewardXp: 220
    },
    {
      id: 'deep_iron_push',
      name: 'Deep Iron Push',
      stages: ['Craft or gather a stone pickaxe', 'Mine 12 iron ore', 'Bring 16 torches for cave safety'],
      rewardXp: 250
    }
  ],
  build: [
    {
      id: 'fortress_bootstrap',
      name: 'Fortress Bootstrap',
      stages: ['Gather 16 logs', 'Gather 16 cobblestone', 'Place 8 torches around your base'],
      rewardXp: 220
    },
    {
      id: 'village_savior',
      name: 'Village Savior',
      stages: ['Harvest 20 crops', 'Replant 20 crops', 'Sleep through one night to secure the village'],
      rewardXp: 260
    }
  ],
  combat: [
    {
      id: 'arena_warmup',
      name: 'Arena Warmup',
      stages: ['Craft or gather a shield', 'Craft or gather an iron sword', 'Win one friendly duel'],
      rewardXp: 280
    }
  ],
  scavenger: [
    {
      id: 'scavenger_hunt',
      name: 'Scavenger Hunt',
      stages: ['Bring one pumpkin', 'Bring one lapis', 'Bring one redstone stack'],
      rewardXp: 300
    }
  ]
}

const questTypeAliases = {
  any: 'random',
  random: 'random',
  mine: 'mining',
  mining: 'mining',
  gather: 'mining',
  collect: 'mining',
  build: 'build',
  builder: 'build',
  combat: 'combat',
  pvp: 'combat',
  scavenger: 'scavenger',
  hunt: 'scavenger'
}

const gatherTargets = {
  iron: { label: 'iron', item: 'iron_ore', amount: 12, rewardXp: 220 },
  coal: { label: 'coal', item: 'coal', amount: 16, rewardXp: 180 },
  stone: { label: 'stone', item: 'cobblestone', amount: 32, rewardXp: 170 },
  wood: { label: 'wood', item: 'oak_log', amount: 24, rewardXp: 170 },
  logs: { label: 'wood', item: 'oak_log', amount: 24, rewardXp: 170 },
  wool: { label: 'wool', item: 'white_wool', amount: 16, rewardXp: 190 },
  food: { label: 'food', item: 'cooked_beef', amount: 10, rewardXp: 180 }
}

const craftRecipes = {
  wooden_pickaxe: { amount: 1, ingredients: ['Gather 3 planks', 'Gather 2 sticks'], rewardXp: 130 },
  stone_pickaxe: { amount: 1, ingredients: ['Gather 3 cobblestone', 'Gather 2 sticks'], rewardXp: 150 },
  iron_pickaxe: { amount: 1, ingredients: ['Gather 3 iron ingots', 'Gather 2 sticks'], rewardXp: 210 },
  wooden_sword: { amount: 1, ingredients: ['Gather 2 planks', 'Gather 1 stick'], rewardXp: 130 },
  stone_sword: { amount: 1, ingredients: ['Gather 2 cobblestone', 'Gather 1 stick'], rewardXp: 150 },
  iron_sword: { amount: 1, ingredients: ['Gather 2 iron ingots', 'Gather 1 stick'], rewardXp: 210 },
  shield: { amount: 1, ingredients: ['Gather 6 planks', 'Gather 1 iron ingot'], rewardXp: 200 },
  torch: { amount: 16, ingredients: ['Gather 1 coal', 'Gather 1 stick'], rewardXp: 120 }
}

const buildPlans = {
  hut: { materials: ['Gather 32 logs', 'Gather 32 planks', 'Gather 16 cobblestone', 'Gather 16 torches'], rewardXp: 260 },
  house: { materials: ['Gather 64 logs', 'Gather 64 planks', 'Gather 48 cobblestone', 'Gather 24 torches'], rewardXp: 320 },
  tower: { materials: ['Gather 96 cobblestone', 'Gather 32 logs', 'Gather 24 torches'], rewardXp: 340 },
  wall: { materials: ['Gather 96 cobblestone', 'Gather 32 torches'], rewardXp: 280 }
}

const autoMineTargets = {
  iron: { blocks: ['iron_ore', 'deepslate_iron_ore'], item: 'iron_ore' },
  coal: { blocks: ['coal_ore', 'deepslate_coal_ore'], item: 'coal' },
  stone: { blocks: ['stone', 'deepslate', 'cobblestone'], item: 'cobblestone' },
  wood: { blocks: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log'], item: 'oak_log' },
  wool: { blocks: ['white_wool', 'black_wool', 'gray_wool', 'light_gray_wool', 'brown_wool', 'red_wool', 'orange_wool', 'yellow_wool', 'lime_wool', 'green_wool', 'cyan_wool', 'light_blue_wool', 'blue_wool', 'purple_wool', 'magenta_wool', 'pink_wool'], item: 'white_wool' }
}

const worldEvents = [
  { id: 'build-battle', text: 'Event: Build Battle! 10 mins. Theme: Hidden Lair. Best creativity wins.' },
  { id: 'resource-rush', text: 'Event: Resource Rush! Bring me 10 iron ingots + 16 logs + 8 coal.' },
  { id: 'mob-hunt', text: 'Event: Night Hunt! Team up and clear mobs around base perimeter.' },
  { id: 'parkour-sprint', text: 'Event: Parkour Sprint! First to finish gets bragging rights + XP.' },
  { id: 'block-hunt', text: 'Event: Block Hunt! Hide in plain sight. Last found wins.' }
]

const personalityReplies = {
  hello: ['Hey crew.', 'Yo legends.', 'Silas reporting in.'],
  help: ['I can guide builds, issue quests, and run chaos events.', 'Need a plan? I can break big jobs into stages.'],
  build: ['Pick a style and I will give you a staged build plan.', 'Want a build challenge? say !silas quest start'],
  pvp: ['PvP mode is spicy. For full chaos use !silas mode mayhem.'],
  thanks: ['Always.', 'Anytime.', 'Got you.']
}

function loadProfiles() {
  try {
    return JSON.parse(fs.readFileSync(profilePath, 'utf8'))
  } catch {
    return {}
  }
}

function saveProfiles(profiles) {
  fs.writeFileSync(profilePath, JSON.stringify(profiles, null, 2))
}

function loadWorldState() {
  try {
    return JSON.parse(fs.readFileSync(worldStatePath, 'utf8'))
  } catch {
    return { parties: {} }
  }
}

function saveWorldState(state) {
  fs.writeFileSync(worldStatePath, JSON.stringify(state, null, 2))
}

// --- NEW CODE START: skill persistence ---
function loadSkills() {
  try {
    return JSON.parse(fs.readFileSync(skillsPath, 'utf8'))
  } catch {
    return {}
  }
}

function saveSkills(skills) {
  fs.writeFileSync(skillsPath, JSON.stringify(skills, null, 2))
}

function getSkillPlan(key) {
  const skills = loadSkills()
  return skills[key] || null
}

function recordSkillSuccess(key, payload) {
  const skills = loadSkills()
  skills[key] = {
    ...payload,
    updatedAt: new Date().toISOString()
  }
  saveSkills(skills)
}
// --- NEW CODE END: skill persistence ---

function getOrCreateProfile(player) {
  const profiles = loadProfiles()
  if (!profiles[player]) {
    profiles[player] = {
      xp: 0,
      level: 1,
      title: 'Rookie Builder',
      classType: null,
      buildStyle: null,
      activeQuest: null,
      completedQuests: [],
      streak: 0,
      lastCheckinDate: null,
      updatedAt: new Date().toISOString()
    }
    saveProfiles(profiles)
  }
  return { profiles, profile: profiles[player] }
}

function setPlayerProfile(player, patch) {
  const { profiles, profile } = getOrCreateProfile(player)
  profiles[player] = { ...profile, ...patch, updatedAt: new Date().toISOString() }
  saveProfiles(profiles)
  return profiles[player]
}

function getPlayerProfile(player) {
  const { profile } = getOrCreateProfile(player)
  return profile
}

function isAdmin(player) {
  return cfg.adminUsers.includes(player)
}

function say(msg) {
  if (!bot) return
  bot.chat(msg.slice(0, 255))
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function levelFromXp(xp) {
  return Math.max(1, Math.floor(Math.sqrt(xp / 100)) + 1)
}

function titleFromLevel(level) {
  if (level >= 12) return 'Chaos Architect'
  if (level >= 9) return 'Quest Warden'
  if (level >= 6) return 'Battle Builder'
  if (level >= 3) return 'Pathfinder'
  return 'Rookie Builder'
}

function classBonus(classType) {
  if (classType === 'builder') return 1.1
  if (classType === 'scout') return 1.08
  if (classType === 'tank') return 1.08
  if (classType === 'alchemist') return 1.12
  return 1
}

function awardXp(player, amount, reason) {
  const profile = getPlayerProfile(player)
  const oldLevel = profile.level || 1
  const bonus = classBonus(profile.classType)
  const finalAmount = Math.round(amount * bonus)
  const newXp = (profile.xp || 0) + finalAmount
  const newLevel = levelFromXp(newXp)
  const patch = { xp: newXp, level: newLevel, title: titleFromLevel(newLevel) }
  setPlayerProfile(player, patch)

  say(`${player} +${finalAmount} XP (${reason}). Total ${newXp} XP.`)
  if (newLevel > oldLevel) say(`${player} level up! ${oldLevel} -> ${newLevel}. New title: ${titleFromLevel(newLevel)}.`)
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function ydayDate() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function checkin(player) {
  const p = getPlayerProfile(player)
  const t = todayDate()
  if (p.lastCheckinDate === t) return say(`${player}, already checked in today. Streak ${p.streak || 0}.`)

  let streak = 1
  if (p.lastCheckinDate === ydayDate()) streak = (p.streak || 0) + 1

  setPlayerProfile(player, { streak, lastCheckinDate: t })
  const bonusXp = Math.min(15 + streak * 5, 60)
  awardXp(player, bonusXp, `daily-checkin x${streak}`)
}

function getPartyByMember(member) {
  const state = loadWorldState()
  for (const [partyName, party] of Object.entries(state.parties || {})) {
    if ((party.members || []).includes(member)) return { state, partyName, party }
  }
  return { state, partyName: null, party: null }
}

function partyCreate(player, name) {
  const clean = (name || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20)
  if (!clean) return say('Use: !silas party create <name>')

  const { state, party: existing } = getPartyByMember(player)
  if (existing) return say(`${player}, leave current party first with !silas party leave`)
  if (state.parties[clean]) return say(`Party ${clean} already exists.`)

  state.parties[clean] = {
    leader: player,
    members: [player],
    activeQuest: null,
    createdAt: new Date().toISOString()
  }
  saveWorldState(state)
  say(`Party created: ${clean}. Invite others with !silas party join ${clean}`)
}

function partyJoin(player, name) {
  const clean = (name || '').toLowerCase()
  const { state, party: existing } = getPartyByMember(player)
  if (existing) return say(`${player}, leave current party first with !silas party leave`)

  const party = state.parties[clean]
  if (!party) return say(`Party ${clean} not found.`)

  party.members = Array.from(new Set([...(party.members || []), player]))
  saveWorldState(state)
  say(`${player} joined party ${clean}.`)
}

function partyLeave(player) {
  const { state, partyName, party } = getPartyByMember(player)
  if (!party) return say(`${player}, you are not in a party.`)

  party.members = (party.members || []).filter(m => m !== player)
  if (!party.members.length) {
    delete state.parties[partyName]
  } else if (party.leader === player) {
    party.leader = party.members[0]
    say(`Party ${partyName} new leader: ${party.leader}`)
  }
  saveWorldState(state)
  say(`${player} left party ${partyName}.`)
}

function partyStatus(player) {
  const { partyName, party } = getPartyByMember(player)
  if (!party) return say(`${player}, no party. Use !silas party create <name>`)
  const q = party.activeQuest ? `${party.activeQuest.name} stage ${party.activeQuest.stage + 1}/${party.activeQuest.stages.length}` : 'none'
  say(`Party ${partyName}: leader ${party.leader}, members ${party.members.join(', ')}, quest ${q}.`)
}

function normalizeQuestType(rawType) {
  const key = (rawType || 'random').toLowerCase()
  return questTypeAliases[key] || null
}

function createQuestFromTemplate(rawType = 'random') {
  const questType = normalizeQuestType(rawType)
  if (!questType) return null

  const pool = questType === 'random'
    ? Object.values(questTemplatesByType).flat()
    : (questTemplatesByType[questType] || [])

  if (!pool.length) return null

  const template = randomChoice(pool)
  return {
    id: template.id,
    type: questType === 'random' ? 'mixed' : questType,
    name: template.name,
    stage: 0,
    stages: [...template.stages],
    rewardXp: template.rewardXp,
    startedAt: new Date().toISOString()
  }
}

function questTypesHint() {
  return 'Types: mining|build|combat|scavenger (or random). Example: !silas quest start mining'
}

function assignQuest(player, rawType = 'random') {
  const quest = createQuestFromTemplate(rawType)
  if (!quest) return say(`Unknown quest type. ${questTypesHint()}`)

  const { state, party } = getPartyByMember(player)

  if (party) {
    if (party.activeQuest) {
      const q = party.activeQuest
      return say(`Party quest: ${q.name}. Stage ${q.stage + 1}/${q.stages.length}: ${q.stages[q.stage]}`)
    }

    party.activeQuest = quest
    saveWorldState(state)
    return say(`Party ${quest.type} quest started: ${party.activeQuest.name}. Stage 1/${party.activeQuest.stages.length}: ${party.activeQuest.stages[0]}`)
  }

  const profile = getPlayerProfile(player)
  if (profile.activeQuest) {
    const q = profile.activeQuest
    return say(`${player}, active quest: ${q.name}. Stage ${q.stage + 1}/${q.stages.length}: ${q.stages[q.stage]}`)
  }

  setPlayerProfile(player, { activeQuest: quest })
  say(`${player}, ${quest.type} quest started: ${quest.name}. Stage 1/${quest.stages.length}: ${quest.stages[0]}`)
}

function assignCustomQuest(player, quest) {
  const { state, party } = getPartyByMember(player)

  if (party) {
    if (party.activeQuest) {
      const q = party.activeQuest
      return say(`Party quest: ${q.name}. Stage ${q.stage + 1}/${q.stages.length}: ${q.stages[q.stage]}`)
    }

    party.activeQuest = quest
    saveWorldState(state)
    return say(`Party mission started: ${party.activeQuest.name}. Stage 1/${party.activeQuest.stages.length}: ${party.activeQuest.stages[0]}`)
  }

  const profile = getPlayerProfile(player)
  if (profile.activeQuest) {
    const q = profile.activeQuest
    return say(`${player}, active quest: ${q.name}. Stage ${q.stage + 1}/${q.stages.length}: ${q.stages[q.stage]}`)
  }

  setPlayerProfile(player, { activeQuest: quest })
  say(`${player}, mission started: ${quest.name}. Stage 1/${quest.stages.length}: ${quest.stages[0]}`)
}

function parseAmount(raw, fallback = 1, max = 128) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(max, Math.max(1, Math.floor(n)))
}

function normalizeBuildMaterial(raw) {
  const v = String(raw || '').toLowerCase().trim()
  if (['stone', 'rock', 'cobble', 'cobblestone'].includes(v)) return 'stone'
  if (['wood', 'timber', 'planks', 'log'].includes(v)) return 'wood'
  return 'mixed'
}

function startGatherMission(player, targetRaw, amountRaw) {
  const key = (targetRaw || '').toLowerCase()
  const target = gatherTargets[key]
  if (!target) return say('Use: !silas gather iron|coal|stone|wood|wool|food [amount]')

  const amount = parseAmount(amountRaw, target.amount)
  const quest = {
    id: `mission_gather_${target.label}`,
    type: 'mission-gather',
    name: `Gather ${amount} ${target.label}`,
    stage: 0,
    stages: [
      `Stay close: use !silas follow ${player}`,
      `Collect ${amount} ${target.label}`,
      'Return to base and stash loot in a chest',
      'Report completion with !silas quest done'
    ],
    rewardXp: target.rewardXp,
    startedAt: new Date().toISOString()
  }

  return assignCustomQuest(player, quest)
}

function startCraftMission(player, itemRaw, amountRaw) {
  const item = (itemRaw || '').toLowerCase()
  const recipe = craftRecipes[item]
  if (!recipe) return say('Use: !silas craft wooden_pickaxe|stone_pickaxe|iron_pickaxe|wooden_sword|stone_sword|iron_sword|shield|torch [amount]')

  const amount = parseAmount(amountRaw, recipe.amount, 32)
  const quest = {
    id: `mission_craft_${item}`,
    type: 'mission-craft',
    name: `Craft ${amount} ${item}`,
    stage: 0,
    stages: [
      ...recipe.ingredients,
      `Craft ${amount} ${item}`,
      'Give gear to player or store in team chest',
      'Report completion with !silas quest done'
    ],
    rewardXp: recipe.rewardXp + Math.min(80, amount * 8),
    startedAt: new Date().toISOString()
  }

  return assignCustomQuest(player, quest)
}

function startBuildMission(player, planRaw, materialRaw) {
  const plan = (planRaw || '').toLowerCase()
  const spec = buildPlans[plan]
  if (!spec) return say('Use: !silas build hut|house|tower|wall [wood|stone]')
  const material = normalizeBuildMaterial(materialRaw)

  const quest = {
    id: `mission_build_${plan}_${material}`,
    type: 'mission-build',
    name: `Build ${plan} (${material})`,
    stage: 0,
    stages: [
      ...spec.materials,
      `Material style: ${material}`,
      `Mark the footprint for the ${plan}`,
      `Build main structure for the ${plan}`,
      'Light perimeter with torches',
      'Report completion with !silas quest done'
    ],
    rewardXp: spec.rewardXp,
    startedAt: new Date().toISOString()
  }

  return assignCustomQuest(player, quest)
}

function startTaskMission(player, taskText) {
  const text = (taskText || '').toLowerCase()
  if (!text) return say('Use: !silas task <what you want me to do>')

  if (/(iron|ore|coal|mine|stone|wood|log|wool|food|gather|collect)/.test(text)) {
    if (text.includes('iron')) return startGatherMission(player, 'iron')
    if (text.includes('coal')) return startGatherMission(player, 'coal')
    if (text.includes('wool')) return startGatherMission(player, 'wool')
    if (text.includes('wood') || text.includes('log')) return startGatherMission(player, 'wood')
    if (text.includes('food')) return startGatherMission(player, 'food')
    return startGatherMission(player, 'stone')
  }

  if (/(sword|weapon|pickaxe|shield|torch|craft|tools?)/.test(text)) {
    if (text.includes('sword')) return startCraftMission(player, 'iron_sword')
    if (text.includes('shield')) return startCraftMission(player, 'shield')
    if (text.includes('torch')) return startCraftMission(player, 'torch', '16')
    return startCraftMission(player, 'iron_pickaxe')
  }

  if (/(house|home|hut|tower|wall|build|base)/.test(text)) {
    if (text.includes('tower')) return startBuildMission(player, 'tower')
    if (text.includes('wall')) return startBuildMission(player, 'wall')
    if (text.includes('hut')) return startBuildMission(player, 'hut')
    return startBuildMission(player, 'house')
  }

  return say('I can map tasks to gather/craft/build. Example: !silas task craft us iron swords')
}

function inventorySummary() {
  const items = (bot?.inventory?.items?.() || [])
  if (!items.length) return say('Inventory empty right now.')

  const counts = {}
  for (const i of items) counts[i.name] = (counts[i.name] || 0) + i.count

  const summary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => `${name}:${count}`)
    .join(', ')

  say(`Inventory top: ${summary}`)
}

async function depositToPlayer(username) {
  const player = bot.players[username]?.entity
  if (!player) return say(`I cannot see you, ${username}. Move near me and retry.`)

  const dist = bot.entity.position.distanceTo(player.position)
  if (dist > 4.5) {
    bot.pathfinder.setGoal(new goals.GoalNear(player.position.x, player.position.y, player.position.z, 2))
    return say(`Moving to ${username} for handoff. Retry !silas deposit in a moment.`)
  }

  const items = bot.inventory.items().filter(i => !i.name.includes('helmet') && !i.name.includes('chestplate') && !i.name.includes('leggings') && !i.name.includes('boots') && !i.name.includes('sword'))
  if (!items.length) return say('Nothing to hand off yet.')

  let dropped = 0
  for (const stack of items.slice(0, 10)) {
    await bot.tossStack(stack).catch(() => {})
    dropped += 1
  }

  say(`Dropped ${dropped} item stacks for ${username}.`)
}

function autoSay(msg, minGapMs = 8000) {
  if (Date.now() - autoState.lastSayAt < minGapMs) return
  autoState.lastSayAt = Date.now()
  say(msg)
}

function itemCount(itemName) {
  return (bot.inventory.items() || []).filter(i => i.name === itemName).reduce((sum, i) => sum + i.count, 0)
}

function nearestAnchorForAuto() {
  const explicit = autoState.job?.owner && bot.players[autoState.job.owner]?.entity
  if (explicit) return explicit
  return nearestHumanPlayer()
}

function safeEntityPosition(entity) {
  const p = entity?.position
  if (!p) return null
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null
  return p
}

function nearestAnchorPosition() {
  return safeEntityPosition(nearestAnchorForAuto())
}

function blockIdsFromNames(names = []) {
  if (!mcDataRef) return []
  return names.map(n => mcDataRef.blocksByName[n]?.id).filter(Boolean)
}

function stopAutoJob(message = 'Auto task cancelled.') {
  if (message && !message.toLowerCase().includes('failed')) autoState.lastSuccess = message
  autoState.job = null
  autoState.currentStep = null
  bot.pathfinder.setGoal(null)
  cleanupPlacedCraftingTable().catch(() => {})
  if (message) say(message)
}

function autoStatus() {
  if (!autoState.enabled) return say('Auto mode is OFF. Use !silas auto on')
  if (!autoState.job) return say(`Auto mode ON. Idle. Radius ${autoState.maxRadius} blocks.`)
  const j = autoState.job
  const progress = j.item ? `${itemCount(j.item)}/${j.amount}` : 'active'
  const material = j.material ? ` ${j.material}` : ''
  say(`Auto mode ON. Job: ${j.kind} ${j.target}${material} (${progress}).`)
}

function autoDebugStatus() {
  const j = autoState.job
  if (!j) return say(`Auto debug: no active job. lastError=${autoState.lastError || 'none'}`)
  say(`Auto debug: step=${autoState.currentStep || 'unknown'}, lastError=${autoState.lastError || 'none'}, lastSuccess=${autoState.lastSuccess || 'none'}`)
}

function startAutoMine(owner, targetRaw, amountRaw) {
  if (!autoState.enabled) return say('Auto mode is OFF. Use !silas auto on first.')
  const target = (targetRaw || '').toLowerCase()
  const spec = autoMineTargets[target]
  if (!spec) return say('Use: !silas auto mine iron|coal|stone|wood|wool <amount>')

  autoState.job = {
    kind: 'mine',
    target,
    item: spec.item,
    blocks: spec.blocks,
    amount: parseAmount(amountRaw, 16, 128),
    owner,
    goal: `mine ${parseAmount(amountRaw, 16, 128)} ${target}`,
    planPrepared: false,
    startedAt: Date.now()
  }

  autoState.currentStep = `prepare-mine:${target}`
  autoState.lastError = null
  say(`Auto mining started: ${target} x${autoState.job.amount}.`) 
}

function startAutoCraft(owner, itemRaw, amountRaw) {
  if (!autoState.enabled) return say('Auto mode is OFF. Use !silas auto on first.')
  const target = (itemRaw || '').toLowerCase()
  if (!mcDataRef?.itemsByName?.[target]) return say('Unknown craft item. Example: !silas auto craft iron_sword 1')

  autoState.job = {
    kind: 'craft',
    target,
    item: target,
    amount: parseAmount(amountRaw, 1, 32),
    owner,
    goal: `craft ${parseAmount(amountRaw, 1, 32)} ${target}`,
    planPrepared: false,
    startedAt: Date.now()
  }

  autoState.currentStep = `prepare-craft:${target}`
  autoState.lastError = null
  say(`Auto crafting started: ${target} x${autoState.job.amount}.`) 
}

function startAutoBuild(owner, planRaw, materialRaw) {
  if (!autoState.enabled) return say('Auto mode is OFF. Use !silas auto on first.')
  const target = (planRaw || '').toLowerCase()
  if (!buildPlans[target]) return say('Use: !silas auto build hut|house|tower|wall [wood|stone]')
  const material = normalizeBuildMaterial(materialRaw)

  autoState.job = {
    kind: 'build',
    target,
    owner,
    material,
    goal: `build a ${material} ${target}`,
    planPrepared: false,
    buildAttempted: false,
    buildRetryUsed: false,
    startedAt: Date.now()
  }

  autoState.currentStep = `prepare-build:${target}:${material}`
  autoState.lastError = null
  say(`Auto build started: ${target} (${material}). I will execute block placement once prerequisites are ready.`)
}

function nearestCraftingTable(maxDistance = 24) {
  const tableId = mcDataRef?.blocksByName?.crafting_table?.id
  if (!tableId) return null
  return bot.findBlock({ matching: tableId, maxDistance })
}

function nearestChest(maxDistance = 24) {
  const chestIds = blockIdsFromNames(['chest', 'trapped_chest'])
  if (!chestIds.length) return null
  return bot.findBlock({ matching: b => chestIds.includes(b.type), maxDistance })
}

async function placeBlockFromInventory(itemName) {
  const stack = bot.inventory.items().find(i => i.name === itemName)
  if (!stack) return null

  const reference = bot.findBlock({
    matching: b => b && b.name !== 'air' && !b.name.includes('water') && !b.name.includes('lava'),
    maxDistance: 4
  })
  if (!reference) return null

  await bot.equip(stack, 'hand').catch(() => {})
  await bot.placeBlock(reference, new Vec3(0, 1, 0)).catch(() => {})
  return reference.position.offset(0, 1, 0)
}

async function placeCraftingTableFromInventory() {
  const placedPos = await placeBlockFromInventory('crafting_table')
  if (!placedPos) return false

  const table = nearestCraftingTable(8)
  if (table) {
    autoState.placedCraftingTablePos = { x: table.position.x, y: table.position.y, z: table.position.z }
    return true
  }
  return false
}

async function placeChestFromInventory() {
  const placedPos = await placeBlockFromInventory('chest')
  if (!placedPos) return false

  const chest = nearestChest(8)
  if (chest) {
    autoState.placedChestPos = { x: chest.position.x, y: chest.position.y, z: chest.position.z }
    return true
  }
  return false
}

async function ensureCraftingTableReady() {
  let table = nearestCraftingTable(32)
  if (table) {
    if (bot.entity.position.distanceTo(table.position) > 3.2) {
      bot.pathfinder.setGoal(new goals.GoalNear(table.position.x, table.position.y, table.position.z, 2))
      autoSay('Moving to nearby crafting table...')
      return { ready: false, table }
    }
    return { ready: true, table }
  }

  if (itemCount('crafting_table') < 1) {
    const plankCount = ['oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks']
      .reduce((sum, name) => sum + itemCount(name), 0)
    if (plankCount >= 4) {
      const crafted = await craftItem('crafting_table', 1, null)
      if (crafted?.ok) autoSay('Crafted a new crafting table for tool bootstrap.')
    }
  }

  const placed = await placeCraftingTableFromInventory()
  if (placed) {
    table = nearestCraftingTable(8)
    if (table) {
      autoSay('Placed a crafting table for bootstrap.')
      if (bot.entity.position.distanceTo(table.position) > 3.2) {
        bot.pathfinder.setGoal(new goals.GoalNear(table.position.x, table.position.y, table.position.z, 2))
        return { ready: false, table }
      }
      return { ready: true, table }
    }
  }

  autoSay('Need a crafting table nearby (or in inventory) for this step.')
  return { ready: false, table: null }
}

async function ensureSharedChestReady() {
  let chest = nearestChest(32)
  if (chest) {
    if (bot.entity.position.distanceTo(chest.position) > 3.2) {
      bot.pathfinder.setGoal(new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2))
      autoSay('Moving to nearby chest...')
      return { ready: false, chest }
    }
    return { ready: true, chest }
  }

  // Try craft chest if we only have planks
  const plankCount = ['oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks']
    .reduce((sum, name) => sum + itemCount(name), 0)
  if (itemCount('chest') < 1 && plankCount >= 8) {
    const tableState = await ensureCraftingTableReady()
    if (tableState.ready && tableState.table) await craftItem('chest', 1, tableState.table)
  }

  const placed = await placeChestFromInventory()
  if (placed) {
    chest = nearestChest(8)
    if (chest) {
      autoSay('Placed a shared chest near me.')
      if (bot.entity.position.distanceTo(chest.position) > 3.2) {
        bot.pathfinder.setGoal(new goals.GoalNear(chest.position.x, chest.position.y, chest.position.z, 2))
        return { ready: false, chest }
      }
      return { ready: true, chest }
    }
  }

  autoSay('Need a chest nearby (or chest/planks in inventory) for shared loot.')
  return { ready: false, chest: null }
}

async function craftItem(itemName, amount = 1, table = null) {
  // --- NEW CODE START: planner/report metadata (step 3) ---
  const before = itemCount(itemName)
  // --- NEW CODE END: planner/report metadata (step 3) ---

  const item = mcDataRef?.itemsByName?.[itemName]
  if (!item) return { ok: false, have: before, wanted: amount, item: itemName }
  const recipes = bot.recipesFor(item.id, null, 1, table)
  if (!recipes.length) return { ok: false, have: before, wanted: amount, item: itemName }
  await bot.craft(recipes[0], amount, table).catch(() => {})
  const after = itemCount(itemName)
  return { ok: after > before, have: after, wanted: amount, item: itemName }
}

// --- NEW CODE START: skill primitives (step 3) ---
async function equipBestToolForBlock(block) {
  if (!block) return

  const pluginTool = bot.pathfinder?.bestHarvestTool?.(block)
  if (pluginTool) {
    await bot.equip(pluginTool, 'hand').catch(() => {})
    return
  }

  const n = String(block.name || '')
  if (n.includes('log') || n.includes('wood')) {
    const axe = pickBestItem(['netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'])
    if (axe) await bot.equip(axe, 'hand').catch(() => {})
    return
  }

  if (n.includes('stone') || n.includes('ore') || n.includes('deepslate') || n.includes('cobblestone')) {
    const pick = pickBestItem(['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe'])
    if (pick) await bot.equip(pick, 'hand').catch(() => {})
  }
}

function isUnsafeDigTarget(block) {
  if (!bot?.entity || !block?.position) return false

  const feet = bot.entity.position
  const feetY = Math.floor(feet.y)
  const targetCenter = block.position.offset(0.5, 0.5, 0.5)
  const closeRange = feet.distanceTo(targetCenter) < 2.1

  // hard-stop straight-down / 1x1 shaft behavior
  if (block.position.y <= feetY - 1 && closeRange) return true
  // avoid tunneling too far below current level
  if (block.position.y < feetY - 1) return true

  // keep mining roughly near anchor elevation so bot can return to surface easier
  const anchorPos = nearestAnchorPosition() || safeEntityPosition(nearestHumanPlayer())
  if (anchorPos) {
    const anchorY = Math.floor(anchorPos.y)
    if (block.position.y < anchorY - 3) return true
  }

  return false
}

function isWaterHazardTarget(block) {
  if (!block?.position) return false
  const at = bot.blockAt(block.position)
  const above = bot.blockAt(block.position.offset(0, 1, 0))
  const near = bot.findBlock({
    matching: b => b && (b.name === 'water' || b.name === 'flowing_water'),
    maxDistance: 2,
    point: block.position
  })
  const nameAt = at?.name || ''
  const nameAbove = above?.name || ''
  return nameAt.includes('water') || nameAbove.includes('water') || !!near
}

function lowBreath() {
  const oxygen = Number(bot?.oxygenLevel ?? 20)
  return Number.isFinite(oxygen) && oxygen <= 8
}

function collectProfile(rawName) {
  const name = String(rawName || '').toLowerCase().trim()
  const logSet = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log']

  if (name === 'oak_log' || name === 'log' || name === 'wood') {
    return { blockNames: logSet, countItems: logSet }
  }

  if (name === 'cobblestone') {
    return {
      blockNames: ['cobblestone', 'stone', 'deepslate', 'cobbled_deepslate'],
      countItems: ['cobblestone', 'cobbled_deepslate']
    }
  }

  return { blockNames: [name], countItems: [name] }
}

async function collectBlocks(blockName, amount = 1, opts = {}) {
  const targetAmount = parseAmount(amount, 1, 512)
  const startedAt = Date.now()
  const timeoutMs = opts.timeoutMs || Math.min(180_000, Math.max(45_000, targetAmount * 3500))
  const profile = collectProfile(Array.isArray(blockName) ? blockName[0] : blockName)
  const blockNames = profile.blockNames
  const countItems = profile.countItems
  const matchingIds = blockIdsFromNames(blockNames)
  const unsafeTargets = new Map()

  if (!matchingIds.length) {
    return { ok: false, reason: `unknown-block:${blockName}`, collected: 0, target: targetAmount }
  }

  const needsPickaxe = blockNames.some(n => /stone|ore|deepslate|cobble/.test(n))
  if (needsPickaxe && !hasAnyPickaxe()) {
    await ensureMiningBootstrap({ target: 'stone' })
  }

  const before = countItems.reduce((sum, n) => sum + itemCount(n), 0)

  while (Date.now() - startedAt < timeoutMs) {
    if (bot.entity.isInWater || lowBreath()) {
      await retreatAndRecover('collect safety: water')
      await new Promise(resolve => setTimeout(resolve, 500))
      continue
    }

    const current = countItems.reduce((sum, n) => sum + itemCount(n), 0)
    if (current - before >= targetAmount) {
      return { ok: true, collected: current - before, target: targetAmount }
    }

    const targetBlock = bot.findBlock({
      matching: b => {
        if (!b || !b.position) return false
        if (!matchingIds.includes(b.type)) return false
        const key = `${b.position.x},${b.position.y},${b.position.z}`
        const avoidUntil = unsafeTargets.get(key) || 0
        return avoidUntil <= Date.now()
      },
      maxDistance: 24
    })

    if (!targetBlock) {
      const a = nearestAnchorPosition()
      if (a) {
        bot.pathfinder.setGoal(new goals.GoalNear(a.x + 3, a.y, a.z + 3, 3))
      }
      autoSay(`No nearby ${blockNames[0]} found, scouting another spot.`, 7000)
      await new Promise(resolve => setTimeout(resolve, 500))
      continue
    }

    if (isWaterHazardTarget(targetBlock)) {
      autoSay('Skipping waterlogged ore/stone to avoid drowning.', 7000)
      const a = nearestAnchorPosition()
      if (a) bot.pathfinder.setGoal(new goals.GoalNear(a.x, a.y, a.z, 3))
      await new Promise(resolve => setTimeout(resolve, 400))
      continue
    }

    bot.pathfinder.setGoal(new goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1))
    if (bot.entity.position.distanceTo(targetBlock.position) > 2.2) {
      await new Promise(resolve => setTimeout(resolve, 300))
      continue
    }

    if (isUnsafeDigTarget(targetBlock)) {
      const unsafeKey = `${targetBlock.position.x},${targetBlock.position.y},${targetBlock.position.z}`
      unsafeTargets.set(unsafeKey, Date.now() + 12_000)
      autoSay('Avoiding unsafe dig below feet. Rerouting to safer block.', 12_000)
      const a = nearestAnchorPosition()
      if (a) {
        bot.pathfinder.setGoal(new goals.GoalNear(a.x, a.y, a.z, 3))
      } else {
        bot.pathfinder.setGoal(new goals.GoalNear(targetBlock.position.x + 2, targetBlock.position.y + 1, targetBlock.position.z + 2, 2))
      }
      await new Promise(resolve => setTimeout(resolve, 500))
      continue
    }

    await equipBestToolForBlock(targetBlock)
    await bot.dig(targetBlock, true).catch(() => {})
  }

  const after = countItems.reduce((sum, n) => sum + itemCount(n), 0)
  return { ok: false, reason: 'timeout', collected: Math.max(0, after - before), target: targetAmount }
}

async function smeltItem(itemName, amount = 1) {
  const targetAmount = parseAmount(amount, 1, 256)
  const furnace = bot.findBlock({ matching: blockIdsFromNames(['furnace']), maxDistance: 8 })
  if (!furnace) return { ok: false, reason: 'no-furnace' }

  const fuel = pickBestItem(['coal', 'charcoal', 'oak_log', 'oak_planks'])
  if (!fuel) return { ok: false, reason: 'no-fuel' }

  const input = bot.inventory.items().find(i => i.name === itemName)
  if (!input) return { ok: false, reason: `missing-input:${itemName}` }

  const f = await bot.openFurnace(furnace).catch(() => null)
  if (!f) return { ok: false, reason: 'open-furnace-failed' }

  await f.putFuel(fuel.type, null, Math.min(fuel.count, 16)).catch(() => {})
  await f.putInput(input.type, null, Math.min(input.count, targetAmount)).catch(() => {})
  await new Promise(resolve => setTimeout(resolve, 4000))

  const output = f.outputItem()
  if (output) {
    await f.takeOutput().catch(() => {})
  }

  f.close()
  return { ok: !!output, output: output?.name || null }
}

function preferredMaterial(candidates) {
  const pick = candidates
    .map(name => ({ name, count: itemCount(name) }))
    .sort((a, b) => b.count - a.count)
    .find(x => x.count > 0)
  return pick?.name || candidates[0]
}

function isAirBlock(block) {
  return !block || ['air', 'cave_air', 'void_air'].includes(block.name)
}

function isReplaceableBlock(block) {
  if (!block) return false
  return [
    'grass', 'tall_grass', 'fern', 'large_fern', 'dead_bush', 'vine', 'snow',
    'dandelion', 'poppy', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'allium', 'blue_orchid',
    'lilac', 'rose_bush', 'peony', 'sunflower'
  ].includes(block.name)
}

function isClearableBuildBlock(block) {
  if (!block) return false
  const n = String(block.name || '')
  const protectedBlocks = ['bedrock', 'obsidian', 'chest', 'trapped_chest', 'furnace', 'crafting_table', 'barrel']
  if (protectedBlocks.some(p => n.includes(p))) return false
  return !isAirBlock(block)
}

function isUnsafeBuildClearTarget(targetPos) {
  if (!bot?.entity || !targetPos) return false
  const feetY = Math.floor(bot.entity.position.y)
  const dist = bot.entity.position.distanceTo(targetPos.offset(0.5, 0.5, 0.5))
  return targetPos.y <= feetY - 1 || (targetPos.y <= feetY && dist < 1.8)
}

function isLikelyOneByOneTrap() {
  if (!bot?.entity) return false
  const p = bot.entity.position.floored()
  const below = bot.blockAt(p.offset(0, -1, 0))
  if (!below || isAirBlock(below)) return false

  const sides = [
    p.offset(1, 0, 0),
    p.offset(-1, 0, 0),
    p.offset(0, 0, 1),
    p.offset(0, 0, -1)
  ]

  return sides.every(pos => {
    const b = bot.blockAt(pos)
    return b && !isAirBlock(b)
  })
}

async function escapeOneByOneTrap() {
  if (!isLikelyOneByOneTrap()) return false

  const p = bot.entity.position.floored()
  const exits = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 }
  ]

  for (const exit of exits) {
    const footPos = p.offset(exit.x, 0, exit.z)
    const headPos = p.offset(exit.x, 1, exit.z)
    const foot = bot.blockAt(footPos)
    const head = bot.blockAt(headPos)

    if (!foot || !isClearableBuildBlock(foot) || foot.name.includes('water') || foot.name.includes('lava')) continue

    await equipBestToolForBlock(foot)
    await bot.dig(foot, true).catch(() => {})

    if (head && !isAirBlock(head) && isClearableBuildBlock(head)) {
      await equipBestToolForBlock(head)
      await bot.dig(head, true).catch(() => {})
    }

    bot.pathfinder.setGoal(new goals.GoalNear(footPos.x, footPos.y, footPos.z, 1))
    autoState.lastError = 'shaft-escape'
    autoSay('Escape routine: cutting out of 1x1 shaft.', 8000)
    return true
  }

  return false
}

function structureTemplate(type, palette) {
  const blocks = []
  const add = (x, y, z, item) => {
    if (!item) return
    blocks.push({ x, y, z, item })
  }

  if (type === 'hut') {
    for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) add(x, 0, z, palette.wood)
    for (let y = 1; y <= 2; y++) {
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) {
        const edge = x === 0 || x === 2 || z === 0 || z === 2
        const doorway = z === 0 && x === 1 && (y === 1 || y === 2)
        if (edge && !doorway) add(x, y, z, palette.wood)
      }
    }
    for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) add(x, 3, z, palette.wood)
    add(0, 1, 0, palette.stone)
    add(2, 1, 0, palette.stone)
    add(0, 2, 2, palette.light)
    add(2, 2, 2, palette.light)
  }

  if (type === 'house') {
    for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) add(x, 0, z, palette.wood)
    for (let y = 1; y <= 3; y++) {
      for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) {
        const edge = x === 0 || x === 4 || z === 0 || z === 4
        const doorway = z === 0 && x === 2 && (y === 1 || y === 2)
        if (edge && !doorway) add(x, y, z, palette.wood)
      }
    }
    for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) add(x, 4, z, palette.stone)
    add(1, 2, 4, palette.light)
    add(3, 2, 4, palette.light)
    add(0, 2, 2, palette.light)
    add(4, 2, 2, palette.light)
  }

  if (type === 'tower') {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) {
        const edge = x === 0 || x === 2 || z === 0 || z === 2
        if (edge) add(x, y, z, palette.stone)
      }
    }
    for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) add(x, 7, z, palette.stone)
    add(1, 6, 1, palette.light)
    add(0, 4, 1, palette.light)
    add(2, 4, 1, palette.light)
  }

  if (type === 'wall') {
    for (let x = 0; x < 12; x++) {
      for (let y = 0; y < 3; y++) add(x, y, 0, palette.stone)
    }
    add(2, 2, 0, palette.light)
    add(6, 2, 0, palette.light)
    add(10, 2, 0, palette.light)
  }

  return blocks
}

async function placeOneBlock(targetPos, itemName) {
  const current = bot.blockAt(targetPos)
  if (current?.name === itemName) return { ok: true, already: true }

  if (!isAirBlock(current)) {
    if (!isReplaceableBlock(current) && !isClearableBuildBlock(current)) {
      return { ok: false, reason: `occupied:${current?.name || 'unknown'}` }
    }

    if (isUnsafeBuildClearTarget(targetPos)) {
      return { ok: false, reason: 'unsafe-clear-near-feet' }
    }

    await equipBestToolForBlock(current)
    await bot.dig(current, true).catch(() => {})
    const cleared = bot.blockAt(targetPos)
    if (!isAirBlock(cleared)) return { ok: false, reason: `occupied:${cleared?.name || 'unknown'}` }
  }

  const item = bot.inventory.items().find(i => i.name === itemName)
  if (!item) return { ok: false, reason: `missing-item:${itemName}` }

  const faces = [
    new Vec3(0, 1, 0),
    new Vec3(0, -1, 0),
    new Vec3(1, 0, 0),
    new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1),
    new Vec3(0, 0, -1)
  ]

  for (const face of faces) {
    const refPos = targetPos.minus(face)
    const ref = bot.blockAt(refPos)
    if (!ref || isAirBlock(ref) || ref.name.includes('water') || ref.name.includes('lava')) continue

    if (bot.entity.position.distanceTo(targetPos.offset(0.5, 0.5, 0.5)) > 4.2) {
      bot.pathfinder.setGoal(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 2))
      await new Promise(resolve => setTimeout(resolve, 300))
      if (bot.entity.position.distanceTo(targetPos.offset(0.5, 0.5, 0.5)) > 4.8) continue
    }

    await bot.equip(item, 'hand').catch(() => {})
    await bot.placeBlock(ref, face).catch(() => {})
    const placed = bot.blockAt(targetPos)
    if (placed?.name === itemName) return { ok: true, placed: true }
  }

  return { ok: false, reason: `no-anchor:${targetPos.x},${targetPos.y},${targetPos.z}` }
}

async function placeStructure(type, opts = {}) {
  const buildType = String(type || '').toLowerCase()
  const known = ['hut', 'house', 'tower', 'wall']
  if (!known.includes(buildType)) return { ok: false, reason: `unknown-structure:${type}` }

  const materialStyle = normalizeBuildMaterial(opts.material)
  const woodCandidates = ['oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks']
  const stoneCandidates = ['cobblestone', 'cobbled_deepslate', 'stone', 'stone_bricks']

  const palette = {
    wood: materialStyle === 'stone' ? preferredMaterial(stoneCandidates) : preferredMaterial(woodCandidates),
    stone: materialStyle === 'wood' ? preferredMaterial(woodCandidates) : preferredMaterial(stoneCandidates),
    light: itemCount('torch') > 0 ? preferredMaterial(['torch']) : null
  }

  const placements = structureTemplate(buildType, palette)
  const requirement = placements.reduce((acc, p) => {
    acc[p.item] = (acc[p.item] || 0) + 1
    return acc
  }, {})

  const missing = Object.entries(requirement)
    .filter(([name, need]) => itemCount(name) < need)
    .map(([name, need]) => ({ item: name, need, have: itemCount(name) }))

  if (missing.length) return { ok: false, reason: 'missing-materials', missing }

  const base = bot.entity.position.floored()
  const candidateOffsets = opts.relocate
    ? [[9, 0], [12, 0], [-9, 0], [0, 9], [0, -9], [12, 6], [12, -6], [-12, 6], [-12, -6]]
    : [[3, 0], [6, 0], [-3, 0], [0, 3], [0, -3], [6, 3], [6, -3], [-6, 3], [-6, -3]]

  const scored = candidateOffsets.map(([ox, oz]) => {
    const origin = base.offset(ox, 0, oz)
    const blocked = placements.reduce((sum, p) => {
      const at = bot.blockAt(origin.offset(p.x, p.y, p.z))
      if (!at || isAirBlock(at) || at.name === p.item || isReplaceableBlock(at)) return sum
      return sum + 1
    }, 0)
    return { origin, blocked }
  }).sort((a, b) => a.blocked - b.blocked)

  const chosen = scored[0]
  const origin = chosen?.origin || base.offset(3, 0, 0)
  if ((chosen?.blocked || 0) > 0) {
    autoSay(`Build site has obstacles (${chosen.blocked}). I will try anyway.`, 6000)
  }

  const ordered = placements
    .map(p => ({ ...p, pos: origin.offset(p.x, p.y, p.z) }))
    .sort((a, b) => a.pos.y - b.pos.y)

  const uniqueOrdered = []
  const seenPlacementKeys = new Set()
  for (const step of ordered) {
    const key = `${step.pos.x},${step.pos.y},${step.pos.z},${step.item}`
    if (seenPlacementKeys.has(key)) continue
    seenPlacementKeys.add(key)
    uniqueOrdered.push(step)
  }

  let placed = 0
  let skipped = 0
  const done = new Set()
  const lastReasons = {}

  for (let pass = 1; pass <= 3; pass++) {
    let progress = false

    for (const step of uniqueOrdered) {
      const key = `${step.pos.x},${step.pos.y},${step.pos.z},${step.item}`
      if (done.has(key)) continue

      const result = await placeOneBlock(step.pos, step.item)
      if (result.ok) {
        done.add(key)
        progress = true
        if (result.already) skipped += 1
        else placed += 1
        continue
      }

      if (result.reason === 'unsafe-clear-near-feet') {
        bot.pathfinder.setGoal(new goals.GoalNear(step.pos.x + 2, step.pos.y + 1, step.pos.z + 2, 2))
        await new Promise(resolve => setTimeout(resolve, 350))
        const retry = await placeOneBlock(step.pos, step.item)
        if (retry.ok) {
          done.add(key)
          progress = true
          if (retry.already) skipped += 1
          else placed += 1
          continue
        }
        lastReasons[key] = retry.reason || 'retry-failed'
        continue
      }

      lastReasons[key] = result.reason || 'place-failed'
    }

    if (done.size === uniqueOrdered.length) break
    if (!progress && pass >= 2) break
  }

  if (done.size !== uniqueOrdered.length) {
    const unresolved = uniqueOrdered.filter(step => !done.has(`${step.pos.x},${step.pos.y},${step.pos.z},${step.item}`))
    const failed = unresolved
      .slice(0, 8)
      .map(step => {
        const key = `${step.pos.x},${step.pos.y},${step.pos.z},${step.item}`
        return { item: step.item, at: [step.pos.x, step.pos.y, step.pos.z], reason: lastReasons[key] || 'unresolved' }
      })

    say(`Build ${buildType} partial: placed ${placed}, failed ${failed.length}/${unresolved.length}.`)
    return { ok: false, reason: 'placement-failed', placed, skipped, failed, failedTotal: unresolved.length }
  }

  say(`Structure ${buildType} (${materialStyle}) complete. Placed ${placed} blocks.`)
  return { ok: true, type: buildType, material: materialStyle, placed, skipped, total: uniqueOrdered.length }
}
// --- NEW CODE END: skill primitives (step 3) ---

// --- NEW CODE START: planner wiring (step 4) ---
function inventorySnapshotForPlanner(limit = 48) {
  const counts = {}
  for (const it of bot.inventory.items() || []) {
    counts[it.name] = (counts[it.name] || 0) + it.count
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => `${name}:${count}`)
}

function extractJsonObject(text) {
  if (!text) return null
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return null
  return text.slice(first, last + 1)
}

function normalizePlannerStep(step) {
  const method = String(step?.method || '').trim()
  const task = String(step?.task || '').trim()
  const amount = Number(step?.amount || 1)
  const pickWord = task.split(/\s+/).filter(Boolean).pop() || ''
  return {
    order: Number(step?.order || 0),
    task,
    method,
    amount: Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 1,
    item: step?.item || pickWord
  }
}

function plannerSkillKey(job) {
  const kind = String(job?.kind || 'task').toLowerCase().trim()
  const target = String(job?.target || '').toLowerCase().trim()
  const goal = String(job?.goal || `${kind} ${target}`).toLowerCase().trim()

  if (kind === 'build') {
    const material = normalizeBuildMaterial(job?.material)
    return `${kind}:${target || goal}:${material}`
  }

  return `${kind}:${target || goal}`
}

function fallbackPlannerTasks(job) {
  if (job?.kind !== 'build') return []

  const target = String(job?.target || '').toLowerCase()
  const style = normalizeBuildMaterial(job?.material)
  const woodStyle = style === 'wood'
  const stoneStyle = style === 'stone'

  if (target === 'hut') {
    if (stoneStyle) {
      return [
        { order: 1, task: 'gather cobblestone', item: 'cobblestone', amount: 36, method: 'collectBlocks' }
      ]
    }

    const tasks = [
      { order: 1, task: 'gather oak_log', item: 'oak_log', amount: 8, method: 'collectBlocks' },
      { order: 2, task: 'craft oak_planks', item: 'oak_planks', amount: 8, method: 'craftItem' },
      { order: 3, task: 'gather cobblestone', item: 'cobblestone', amount: 2, method: 'collectBlocks' }
    ]
    if (woodStyle) tasks.pop()
    return tasks
  }

  if (target === 'house') {
    if (stoneStyle) {
      return [
        { order: 1, task: 'gather cobblestone', item: 'cobblestone', amount: 96, method: 'collectBlocks' }
      ]
    }

    const tasks = [
      { order: 1, task: 'gather oak_log', item: 'oak_log', amount: 24, method: 'collectBlocks' },
      { order: 2, task: 'craft oak_planks', item: 'oak_planks', amount: 24, method: 'craftItem' },
      { order: 3, task: 'gather cobblestone', item: 'cobblestone', amount: 32, method: 'collectBlocks' }
    ]
    if (woodStyle) tasks.pop()
    return tasks
  }

  if (target === 'tower') {
    return [
      { order: 1, task: 'gather cobblestone', item: 'cobblestone', amount: 72, method: 'collectBlocks' }
    ]
  }

  if (target === 'wall') {
    return [
      { order: 1, task: 'gather cobblestone', item: 'cobblestone', amount: 36, method: 'collectBlocks' }
    ]
  }

  return []
}

async function callPlannerLLM(goal, failedTasks = []) {
  const inventory = inventorySnapshotForPlanner().join(', ') || 'empty'
  const time = String(bot.time?.timeOfDay ?? 0)
  const health = String(bot.health ?? 20)
  const pos = bot.entity?.position ? `${bot.entity.position.x.toFixed(1)},${bot.entity.position.y.toFixed(1)},${bot.entity.position.z.toFixed(1)}` : 'unknown'
  const failedLine = failedTasks.length ? `Previously failed: ${failedTasks.join(' | ')} — choose a different approach` : ''

  const prompt = `You are a Minecraft AI agent using Mineflayer. You have been given a goal. Before executing it, you must plan. Respond ONLY in this JSON format:\n{\n  "goal": "${goal}",\n  "materialsNeeded": ["item1", "item2"],\n  "materialsHave": ["item1"],\n  "materialsMissing": ["item2"],\n  "prerequisiteTasks": [\n    { "order": 1, "task": "gather oak_log", "amount": 10, "method": "collectBlocks" },\n    { "order": 2, "task": "craft planks", "amount": 20, "method": "craftItem" },\n    { "order": 3, "task": "craft sticks", "amount": 8, "method": "craftItem" }\n  ],\n  "safetyChecks": {\n    "isNight": true,\n    "nearLava": false,\n    "healthOk": true,\n    "action": "wait for daylight before starting"\n  },\n  "estimatedSteps": 5,\n  "fallbackIfFails": "inform player and deposit what was gathered"\n}\nCurrent inventory: ${inventory}\nCurrent time: ${time}\nCurrent health: ${health}\nCurrent position: ${pos}\nGoal: ${goal}${failedLine ? `\n${failedLine}` : ''}`

  const out = spawnSync('codex', ['exec', prompt], {
    encoding: 'utf8',
    timeout: 45000
  })

  const raw = [out.stdout, out.stderr].filter(Boolean).join('\n').trim()
  const extracted = extractJsonObject(raw)

  if (!extracted) {
    return {
      goal,
      materialsNeeded: [],
      materialsHave: [],
      materialsMissing: [],
      prerequisiteTasks: [],
      safetyChecks: {},
      estimatedSteps: 0,
      fallbackIfFails: 'inform player and deposit what was gathered'
    }
  }

  try {
    return JSON.parse(extracted)
  } catch {
    return {
      goal,
      materialsNeeded: [],
      materialsHave: [],
      materialsMissing: [],
      prerequisiteTasks: [],
      safetyChecks: {},
      estimatedSteps: 0,
      fallbackIfFails: 'inform player and deposit what was gathered'
    }
  }
}

async function executePlannerStep(step, job) {
  const s = normalizePlannerStep(step)
  if (!s.method) return { ok: false, reason: 'missing-method' }

  if (s.method === 'collectBlocks') return collectBlocks(s.item, s.amount)
  if (s.method === 'craftItem') return craftItem(s.item, s.amount)
  if (s.method === 'smeltItem') return smeltItem(s.item, s.amount)
  if (s.method === 'placeStructure') return placeStructure(s.item || job.target, { material: job.material })

  return { ok: false, reason: `unknown-method:${s.method}` }
}

async function debugRepairLoop(step, job, attemptLimit = 3) {
  const normalized = normalizePlannerStep(step)
  const errors = []

  for (let attempt = 1; attempt <= attemptLimit; attempt++) {
    try {
      const result = await executePlannerStep(normalized, job)
      if (result?.ok) return { ok: true, result, attempts: attempt, errors }
      errors.push(result?.reason || `step-failed-attempt-${attempt}`)
    } catch (err) {
      errors.push(err?.message || 'exception')
    }

    if (attempt < attemptLimit) {
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }

  return {
    ok: false,
    reason: 'repair-exhausted',
    attempts: attemptLimit,
    errors,
    step: {
      method: normalized.method,
      item: normalized.item,
      amount: normalized.amount,
      task: normalized.task
    }
  }
}

async function planTask(job, botRef) {
  const failedTasks = []
  const failedCounts = {}
  const goal = job.goal || `${job.kind} ${job.target}`
  const skillKey = plannerSkillKey(job)
  const cachedSkill = getSkillPlan(skillKey)

  for (let attempt = 0; attempt < 2; attempt++) {
    const useCached = attempt === 0 && cachedSkill && Array.isArray(cachedSkill.prerequisiteTasks) && cachedSkill.prerequisiteTasks.length > 0
    const plan = useCached
      ? cachedSkill
      : await callPlannerLLM(goal, failedTasks)

    const plannedTasks = Array.isArray(plan.prerequisiteTasks)
      ? [...plan.prerequisiteTasks].sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      : []
    const tasks = plannedTasks.length ? plannedTasks : fallbackPlannerTasks(job)

    if (!tasks.length) {
      if (!failedTasks.includes('empty-plan')) failedTasks.push('empty-plan')
      continue
    }

    for (const step of tasks) {
      const normalized = normalizePlannerStep(step)
      const key = normalized.task || `${normalized.method}:${normalized.item}`
      autoState.currentStep = `plan:${key}`

      if (
        normalized.item &&
        ['collectBlocks', 'craftItem', 'smeltItem'].includes(normalized.method) &&
        itemCount(normalized.item) >= normalized.amount
      ) {
        continue
      }

      const before = normalized.item ? itemCount(normalized.item) : 0
      const execState = await debugRepairLoop(normalized, job, 3)
      const result = execState?.result || { ok: false, reason: execState?.reason || 'unknown' }

      const after = normalized.item ? itemCount(normalized.item) : before
      const inventoryMoved = normalized.item ? after >= before : true
      const ok = !!result?.ok && inventoryMoved

      if (!ok) {
        const reasons = (execState?.errors || []).filter(Boolean).join(' | ')
        if (reasons) {
          autoState.lastError = `${key}:${reasons}`
          autoSay(`Repair loop: ${key} failed (${reasons}).`, 8000)
        }

        failedCounts[key] = (failedCounts[key] || 0) + 1
        if (failedCounts[key] >= 2 && !failedTasks.includes(key)) {
          failedTasks.push(key)
        }
      }
    }

    if (!failedTasks.length) {
      autoState.lastError = null
      autoState.lastSuccess = `planner-ready:${job.kind}:${job.target}`
      if (tasks.length > 0) {
        recordSkillSuccess(skillKey, {
          goal,
          prerequisiteTasks: tasks
        })
      }
      return true
    }
  }

  say(`Planner warnings: ${failedTasks.join(', ') || 'none'}. Proceeding with best effort.`)
  return true
}
// --- NEW CODE END: planner wiring (step 4) ---

async function craftPlanksAndSticks() {
  const logs = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log']
  const logToPlanks = {
    oak_log: 'oak_planks',
    birch_log: 'birch_planks',
    spruce_log: 'spruce_planks',
    jungle_log: 'jungle_planks',
    acacia_log: 'acacia_planks',
    dark_oak_log: 'dark_oak_planks',
    mangrove_log: 'mangrove_planks',
    cherry_log: 'cherry_planks'
  }

  let anyPlanks = itemCount('oak_planks') + itemCount('birch_planks') + itemCount('spruce_planks') + itemCount('jungle_planks') + itemCount('acacia_planks') + itemCount('dark_oak_planks') + itemCount('mangrove_planks') + itemCount('cherry_planks')

  if (anyPlanks < 4) {
    const logName = logs.find(n => itemCount(n) > 0)
    if (logName) {
      await craftItem(logToPlanks[logName], 1, null)
    }
  }

  if (itemCount('stick') < 2) {
    await craftItem('stick', 1, null)
  }
}

async function gatherNearbyLog() {
  const logIds = blockIdsFromNames(autoMineTargets.wood.blocks)
  const logBlock = bot.findBlock({ matching: b => logIds.includes(b.type), maxDistance: 20 })
  if (!logBlock) return false

  bot.pathfinder.setGoal(new goals.GoalNear(logBlock.position.x, logBlock.position.y, logBlock.position.z, 1))
  if (bot.entity.position.distanceTo(logBlock.position) > 2.2) return true

  await bot.dig(logBlock, true).catch(() => {})
  return true
}

function hasAnyPickaxe() {
  return !!pickBestItem(['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe'])
}

function hasStoneTierPickaxe() {
  return !!pickBestItem(['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe'])
}

function hasAnySword() {
  return !!pickBestItem(['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword'])
}

async function ensureWeaponBootstrap() {
  if (hasAnySword()) return true

  await craftPlanksAndSticks()
  const tableState = await ensureCraftingTableReady()
  if (!tableState.ready || !tableState.table) return false
  const table = tableState.table

  if (itemCount('iron_ingot') >= 2 && itemCount('stick') >= 1 && (await craftItem('iron_sword', 1, table)).ok) return true
  if (itemCount('cobblestone') >= 2 && itemCount('stick') >= 1 && (await craftItem('stone_sword', 1, table)).ok) return true

  const planks = itemCount('oak_planks') + itemCount('birch_planks') + itemCount('spruce_planks') + itemCount('jungle_planks') + itemCount('acacia_planks') + itemCount('dark_oak_planks') + itemCount('mangrove_planks') + itemCount('cherry_planks')
  if (planks >= 2 && itemCount('stick') >= 1) await craftItem('wooden_sword', 1, table)

  return hasAnySword()
}

async function ensureMiningBootstrap(job) {
  const needStoneTier = job.target === 'iron'

  if (!needStoneTier && hasAnyPickaxe()) return true
  if (needStoneTier && hasStoneTierPickaxe()) return true

  // Step 1: make sure we can craft basic tools
  await craftPlanksAndSticks()

  // if no logs/planks/sticks at all, gather logs first
  const hasWoodBase = itemCount('stick') > 0 || itemCount('oak_planks') > 0 || itemCount('birch_planks') > 0 || itemCount('spruce_planks') > 0 || itemCount('jungle_planks') > 0 || itemCount('acacia_planks') > 0 || itemCount('dark_oak_planks') > 0 || itemCount('mangrove_planks') > 0 || itemCount('cherry_planks') > 0
  if (!hasWoodBase && !hasAnyPickaxe()) {
    const foundLog = await gatherNearbyLog()
    if (!foundLog) {
      autoSay('No tools yet and no nearby logs. Bring me near trees.')
      return false
    }
    return false
  }

  const tableState = await ensureCraftingTableReady()
  if (!tableState.ready || !tableState.table) return false
  const table = tableState.table

  if (!hasAnyPickaxe()) {
    await craftItem('wooden_pickaxe', 1, table)
  }

  // For iron jobs: ensure stone-tier pickaxe
  if (needStoneTier && !hasStoneTierPickaxe()) {
    if (itemCount('cobblestone') < 3) {
      const stoneIds = blockIdsFromNames(['stone', 'deepslate'])
      const stoneBlock = bot.findBlock({ matching: b => stoneIds.includes(b.type), maxDistance: 16 })
      if (!stoneBlock) {
        autoSay('Need cobblestone to upgrade pickaxe. Bring me to stone.')
        return false
      }

      bot.pathfinder.setGoal(new goals.GoalNear(stoneBlock.position.x, stoneBlock.position.y, stoneBlock.position.z, 1))
      if (bot.entity.position.distanceTo(stoneBlock.position) > 2.2) return false

      const anyPick = pickBestItem(['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'])
      if (anyPick) await bot.equip(anyPick, 'hand').catch(() => {})
      await bot.dig(stoneBlock, true).catch(() => {})
      return false
    }

    await craftItem('stone_pickaxe', 1, table)
  }

  return needStoneTier ? hasStoneTierPickaxe() : hasAnyPickaxe()
}

async function stashToChest(owner) {
  const chestState = await ensureSharedChestReady()
  if (!chestState.ready || !chestState.chest) return false

  const container = await bot.openContainer(chestState.chest).catch(() => null)
  if (!container) {
    autoSay('Could not open chest for stash.')
    return false
  }

  const keepPatterns = ['helmet', 'chestplate', 'leggings', 'boots', 'sword', 'pickaxe', 'axe', 'shield', 'crafting_table', 'chest']
  const keepNames = new Set(['bread', 'cooked_beef', 'cooked_chicken', 'cooked_porkchop', 'cooked_mutton'])

  let movedStacks = 0
  for (const stack of bot.inventory.items()) {
    if (!stack) continue
    if (keepNames.has(stack.name)) continue
    if (keepPatterns.some(p => stack.name.includes(p))) continue

    await container.deposit(stack.type, stack.metadata, stack.count).catch(() => {})
    movedStacks += 1
    if (movedStacks >= 12) break
  }

  container.close()
  if (movedStacks > 0) say(`Stashed ${movedStacks} stacks into shared chest.`)
  return movedStacks > 0
}

async function cleanupPlacedCraftingTable() {
  if (!autoState.placedCraftingTablePos) return

  const pos = autoState.placedCraftingTablePos
  const block = bot.blockAt(new Vec3(pos.x, pos.y, pos.z))
  if (!block || block.name !== 'crafting_table') {
    autoState.placedCraftingTablePos = null
    return
  }

  if (bot.entity.position.distanceTo(block.position) > 4.5) {
    bot.pathfinder.setGoal(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2))
    return
  }

  await bot.dig(block, true).catch(() => {})
  autoState.placedCraftingTablePos = null
  autoSay('Picked up temporary crafting table.')
}

async function autoMineTick(job) {
  autoState.currentStep = `mine:${job.target}`

  if (bot.entity.isInWater || lowBreath()) {
    autoState.lastError = 'water-risk'
    await retreatAndRecover('mine safety: water')
    return
  }

  if (itemCount(job.item) >= job.amount) {
    awardXp(job.owner, 120, `auto-mine:${job.target}`)
    return stopAutoJob(`Auto mine complete: ${job.target} x${job.amount}. Kept materials in inventory for next job.`)
  }

  const toolsReady = await ensureMiningBootstrap(job)
  if (!toolsReady) return

  await ensureWeaponBootstrap()

  const anchor = nearestAnchorForAuto()
  const anchorPos = safeEntityPosition(anchor)
  if (anchor && anchorPos && bot.entity.position.distanceTo(anchorPos) > autoState.maxRadius) {
    bot.pathfinder.setGoal(new goals.GoalFollow(anchor, 3), true)
    return autoSay('Regrouping to stay in safe radius.')
  }

  const blockIds = blockIdsFromNames(job.blocks)
  const targetBlock = bot.findBlock({
    matching: b => blockIds.includes(b.type),
    maxDistance: 24
  })

  if (!targetBlock) {
    if (anchor && anchorPos) bot.pathfinder.setGoal(new goals.GoalFollow(anchor, 3), true)
    return autoSay(`No nearby ${job.target} found. Following team.`)
  }

  if (isWaterHazardTarget(targetBlock)) {
    autoState.lastError = 'waterlogged-target'
    if (anchor && anchorPos) bot.pathfinder.setGoal(new goals.GoalFollow(anchor, 3), true)
    return autoSay('Waterlogged target skipped for safety.', 7000)
  }

  bot.pathfinder.setGoal(new goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 1))

  if (bot.entity.position.distanceTo(targetBlock.position) > 2.2) return

  if (isUnsafeDigTarget(targetBlock)) {
    autoState.lastError = 'unsafe-dig-target'
    bot.pathfinder.setGoal(new goals.GoalNear(targetBlock.position.x, targetBlock.position.y + 1, targetBlock.position.z, 2))
    return autoSay('Unsafe dig angle detected, repositioning.', 6000)
  }

  const pickaxe = pickBestItem(['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe'])
  if (pickaxe) await bot.equip(pickaxe, 'hand').catch(() => {})

  await bot.dig(targetBlock, true).catch(() => {})
}

async function autoCraftTick(job) {
  autoState.currentStep = `craft:${job.target}`
  if (itemCount(job.item) >= job.amount) {
    awardXp(job.owner, 140, `auto-craft:${job.target}`)
    return stopAutoJob(`Auto craft complete: ${job.target} x${job.amount}.`)
  }

  const item = mcDataRef?.itemsByName?.[job.item]
  if (!item) {
    autoState.lastError = 'unknown-craft-item'
    return stopAutoJob('Auto craft stopped: unknown item.')
  }

  let table = null
  let recipes = bot.recipesFor(item.id, null, 1, null)

  if (!recipes.length) {
    const tableState = await ensureCraftingTableReady()
    if (!tableState.ready || !tableState.table) return
    table = tableState.table
    recipes = bot.recipesFor(item.id, null, 1, table)
  }

  if (!recipes.length) {
    autoState.lastError = `missing-ingredients:${job.target}`
    return autoSay(`Missing ingredients for ${job.target}.`)
  }

  await bot.craft(recipes[0], 1, table).catch(() => {})
}

async function autoBuildTick(job) {
  autoState.currentStep = `build:${job.target}:${job.material || 'mixed'}`
  const plan = buildPlans[job.target]
  if (!plan) {
    autoState.lastError = 'unknown-plan'
    return stopAutoJob('Auto build stopped: unknown plan.')
  }
  if (job.buildAttempted) return

  job.buildAttempted = true
  let placed = await placeStructure(job.target, { material: job.material })

  if (!placed?.ok && placed?.reason === 'placement-failed' && !job.buildRetryUsed) {
    job.buildRetryUsed = true
    autoSay('Relocating build site and retrying structure placement.', 3000)
    placed = await placeStructure(job.target, { material: job.material, relocate: true })
  }

  if (!placed?.ok) {
    const reason = placed?.reason || 'unknown'
    autoState.lastError = `build-failed:${reason}`
    return stopAutoJob(`Auto build failed: ${reason}.`)
  }

  autoState.lastError = null
  return stopAutoJob(`Auto build complete: ${job.target} (${placed.placed}/${placed.total}).`)
}

async function autoTick() {
  if (!autoState.enabled || !autoState.job || autoState.busy || !bot?.entity) return

  autoState.busy = true
  try {
    if (bot.health <= 10 || bot.entity.isInWater || bot.entity.isInLava) {
      await retreatAndRecover('auto safety')
      return
    }

    const job = autoState.job
    autoState.currentStep = `tick:${job.kind}:${job.target}`

    // --- NEW CODE START: prerequisite planner gate (step 4) ---
    if (['mine', 'craft', 'build'].includes(job.kind) && !job.planPrepared) {
      const ready = await planTask(job, bot)
      if (!ready) return
      job.planPrepared = true
    }
    // --- NEW CODE END: prerequisite planner gate (step 4) ---

    if (job.kind === 'mine') await autoMineTick(job)
    if (job.kind === 'craft') await autoCraftTick(job)
    if (job.kind === 'build') await autoBuildTick(job)
  } catch (err) {
    autoState.lastError = err?.message || 'autoTick-error'
  } finally {
    autoState.busy = false
  }
}

function questStatus(player) {
  const { party } = getPartyByMember(player)
  if (party?.activeQuest) {
    const q = party.activeQuest
    return say(`Party quest ${q.name}. Stage ${q.stage + 1}/${q.stages.length}: ${q.stages[q.stage]}`)
  }

  const profile = getPlayerProfile(player)
  if (!profile.activeQuest) return say(`${player}, no active quest. Use !silas quest start`)
  const q = profile.activeQuest
  say(`${player}, ${q.name}. Stage ${q.stage + 1}/${q.stages.length}: ${q.stages[q.stage]}`)
}

function questAdvance(player) {
  const { state, party } = getPartyByMember(player)
  if (party?.activeQuest) {
    const q = party.activeQuest
    q.stage += 1

    if (q.stage >= q.stages.length) {
      party.activeQuest = null
      saveWorldState(state)
      say(`Party quest complete: ${q.name}. Rewards for all members.`)
      for (const m of party.members || []) awardXp(m, q.rewardXp, `party-quest:${q.name}`)
      return
    }

    saveWorldState(state)
    say(`Party next stage ${q.stage + 1}/${q.stages.length}: ${q.stages[q.stage]}`)
    return
  }

  const profile = getPlayerProfile(player)
  if (!profile.activeQuest) return say(`${player}, no active quest to advance.`)

  const q = profile.activeQuest
  q.stage += 1

  if (q.stage >= q.stages.length) {
    const completed = [...(profile.completedQuests || []), { id: q.id, name: q.name, completedAt: new Date().toISOString() }]
    setPlayerProfile(player, { activeQuest: null, completedQuests: completed })
    say(`${player}, quest complete: ${q.name}. Reward incoming.`)
    awardXp(player, q.rewardXp, `quest:${q.name}`)
    return
  }

  setPlayerProfile(player, { activeQuest: q })
  say(`${player}, next stage ${q.stage + 1}/${q.stages.length}: ${q.stages[q.stage]}`)
}

function questAbandon(player) {
  const { state, party } = getPartyByMember(player)
  if (party?.activeQuest) {
    if (party.leader !== player && !isAdmin(player)) return say('Only party leader/admin can abandon party quest.')
    party.activeQuest = null
    saveWorldState(state)
    return say('Party quest abandoned.')
  }

  const profile = getPlayerProfile(player)
  if (!profile.activeQuest) return say(`${player}, no active quest to abandon.`)
  setPlayerProfile(player, { activeQuest: null })
  say(`${player}, quest abandoned. No judgement. Reboot with !silas quest start`)
}

function profileSummary(player) {
  const p = getPlayerProfile(player)
  const cls = p.classType || 'unassigned'
  const streak = p.streak || 0
  say(`${player}: lvl ${p.level || 1}, xp ${p.xp || 0}, class ${cls}, streak ${streak}, title ${p.title || 'Rookie Builder'}.`)
}

function setClass(player, classType) {
  if (!classes.includes(classType)) return say(`Classes: ${classes.join(', ')}`)
  setPlayerProfile(player, { classType })
  say(`${player}, class set to ${classType}. Passive XP bonus active.`)
  awardXp(player, 20, `class:${classType}`)
}

function runWorldEvent(forceBy) {
  const onlinePlayers = Object.keys(bot.players || {}).filter(p => p !== bot.username)
  if (!onlinePlayers.length) return

  const ev = randomChoice(worldEvents)
  say(ev.text)

  if (forceBy) awardXp(forceBy, 30, `event-call:${ev.id}`)
}

function maybePersonalityReply(username, message) {
  const text = message.toLowerCase()
  if (!text.includes('silas') && Math.random() > 0.06) return

  const key =
    (text.includes('hello') || text.includes('hi') || text.includes('yo')) ? 'hello'
      : text.includes('help') ? 'help'
        : text.includes('build') ? 'build'
          : text.includes('pvp') ? 'pvp'
            : (text.includes('thanks') || text.includes('thx')) ? 'thanks'
              : null

  if (!key) return
  say(`${username}: ${randomChoice(personalityReplies[key])}`)
}

let survivalBusy = false
let lastFoodTryAt = 0
let lastRetreatSayAt = 0
let lastSurvivalTickAt = 0
let lastDaytimeThreatSweepAt = 0

function pickBestItem(namesByPriority) {
  for (const itemName of namesByPriority) {
    const found = bot.inventory.items().find(i => i.name === itemName)
    if (found) return found
  }
  return null
}

function pickFoodItem() {
  const preferredFoods = [
    'cooked_beef', 'cooked_porkchop', 'golden_carrot', 'cooked_mutton', 'cooked_chicken',
    'baked_potato', 'bread', 'carrot', 'apple'
  ]
  return pickBestItem(preferredFoods)
}

async function equipBestCombatLoadout() {
  const sword = pickBestItem(['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword'])
  const axe = pickBestItem(['netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe'])

  const helmet = pickBestItem(['netherite_helmet', 'diamond_helmet', 'iron_helmet', 'chainmail_helmet', 'golden_helmet', 'leather_helmet'])
  const chest = pickBestItem(['netherite_chestplate', 'diamond_chestplate', 'iron_chestplate', 'chainmail_chestplate', 'golden_chestplate', 'leather_chestplate'])
  const legs = pickBestItem(['netherite_leggings', 'diamond_leggings', 'iron_leggings', 'chainmail_leggings', 'golden_leggings', 'leather_leggings'])
  const boots = pickBestItem(['netherite_boots', 'diamond_boots', 'iron_boots', 'chainmail_boots', 'golden_boots', 'leather_boots'])

  if (sword || axe) await bot.equip(sword || axe, 'hand').catch(() => {})
  if (helmet) await bot.equip(helmet, 'head').catch(() => {})
  if (chest) await bot.equip(chest, 'torso').catch(() => {})
  if (legs) await bot.equip(legs, 'legs').catch(() => {})
  if (boots) await bot.equip(boots, 'feet').catch(() => {})
}

function nearestHumanPlayer() {
  const candidates = Object.values(bot.players || {})
    .map(p => p.entity)
    .filter(Boolean)
    .filter(e => e.username !== bot.username)

  if (!candidates.length) return null

  const adminFirst = candidates.find(e => isAdmin(e.username))
  if (adminFirst) return adminFirst

  return candidates.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0]
}

function nearestHostileMob(maxDistance = 8) {
  const hostile = new Set([
    'zombie', 'husk', 'drowned', 'skeleton', 'stray', 'spider', 'cave_spider', 'creeper',
    'witch', 'pillager', 'vindicator', 'evoker', 'phantom', 'enderman', 'slime', 'magma_cube'
  ])

  return bot.nearestEntity(e => {
    if (!e || e.type !== 'mob') return false
    if (!hostile.has(e.name)) return false
    if (!e.position || !bot?.entity?.position) return false
    return bot.entity.position.distanceTo(e.position) <= maxDistance
  })
}

function nearbyHostiles(maxDistance = 10) {
  const hostile = new Set([
    'zombie', 'husk', 'drowned', 'skeleton', 'stray', 'spider', 'cave_spider', 'creeper',
    'witch', 'pillager', 'vindicator', 'evoker', 'phantom', 'enderman', 'slime', 'magma_cube'
  ])

  return Object.values(bot.entities || {})
    .filter(e => e && e.type === 'mob' && hostile.has(e.name) && e.position)
    .filter(e => bot.entity.position.distanceTo(e.position) <= maxDistance)
}

async function retreatAndRecover(reason) {
  lastCombatRetreatAt = Date.now()
  const hardReason = String(reason || '')
  if (hardReason.includes('hostile') || hardReason.includes('safety') || hardReason.includes('low health')) {
    combatRearmAt = Math.max(combatRearmAt, Date.now() + 12_000)
  }

  bot.pvp.stop()

  const anchor = nearestHumanPlayer()
  if (anchor) {
    bot.pathfinder.setGoal(new goals.GoalFollow(anchor, 3), true)
  } else {
    const pos = bot.entity.position
    bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y + 1, pos.z, 2))
  }

  if (Date.now() - lastRetreatSayAt > 20000) {
    say(`Tactical retreat (${reason}) - regrouping.`)
    lastRetreatSayAt = Date.now()
  }

  if (bot.food < 18) {
    const food = pickFoodItem()
    if (food) {
      await bot.equip(food, 'hand').catch(() => {})
      await bot.consume().catch(() => {})
    }
  }
}

async function survivalTick() {
  if (survivalBusy || !bot?.entity) return
  survivalBusy = true

  try {
    if (Date.now() - lastWeaponBootstrapAt > 20_000) {
      await ensureWeaponBootstrap().catch(() => {})
      lastWeaponBootstrapAt = Date.now()
    }

    const activeJobKind = autoState.job?.kind || null
    if (activeJobKind !== 'mine') {
      await equipBestCombatLoadout()
    }

    const lowHealth = bot.health <= 10
    const underwater = bot.entity.isInWater || bot.entity.isInLava

    if (lowHealth || underwater) {
      await retreatAndRecover(lowHealth ? 'low health' : 'bad terrain')
    }

    const hostileList = nearbyHostiles(8)
    const hostile = hostileList[0] || null
    if (hostile) {
      const now = Date.now()
      const swarmPressure = hostileList.length >= 3
      const creeperPressure = hostileList.some(e => e.name === 'creeper' && bot.entity.position.distanceTo(e.position) < 4.5)
      const retreatCooldown = now - lastCombatRetreatAt < 10_000
      const rearmWindow = now < combatRearmAt

      if (swarmPressure || creeperPressure || bot.health <= 13 || retreatCooldown || rearmWindow) {
        await retreatAndRecover(swarmPressure ? 'hostile swarm' : `close ${hostile.name}`)
      } else if (hasAnySword()) {
        if (!bot.pvp.target) {
          bot.pvp.attack(hostile)
          autoSay(`Defending against ${hostile.name}.`, 6000)
        }
      } else {
        await retreatAndRecover(`hostile:${hostile.name}`)
      }
    } else if (bot.pvp.target && !guardTarget) {
      bot.pvp.stop()
      if (bot.health > 15) combatRearmAt = 0
    }

    if (bot.food < 14 && Date.now() - lastFoodTryAt > 12000) {
      const food = pickFoodItem()
      if (food) {
        await bot.equip(food, 'hand').catch(() => {})
        await bot.consume().catch(() => {})
      }
      lastFoodTryAt = Date.now()
    }
  } finally {
    survivalBusy = false
  }
}

// --- NEW CODE START: safety rails loop (step 2) ---
async function safetyCheck() {
  if (!bot?.entity) return

  const now = Date.now()
  recentPositions.push({
    t: now,
    x: bot.entity.position.x,
    y: bot.entity.position.y,
    z: bot.entity.position.z
  })
  while (recentPositions.length > 5) recentPositions.shift()

  if (bot.health <= 10) {
    await retreatAndRecover('safety: low health')
    return
  }

  if (bot.entity.isInLava || bot.entity.isInWater) {
    await retreatAndRecover('safety: bad terrain')
    return
  }

  const lavaId = mcDataRef?.blocksByName?.lava?.id
  if (lavaId) {
    const nearLava = bot.findBlock({ matching: lavaId, maxDistance: 3 })
    if (nearLava) {
      await retreatAndRecover('safety: lava nearby')
      return
    }
  }

  const timeOfDay = bot.time?.timeOfDay ?? 0
  const isNight = timeOfDay >= 13000 && timeOfDay <= 23000
  if (isNight && autoState.keepDaytime && now - autoState.lastDaytimeSetAt > 60_000) {
    autoState.lastDaytimeSetAt = now
    bot.chat('/time set day')
    autoSay('Daytime lock: setting day for test runs.', 10000)
  }

  if (autoState.keepDaytime && now - lastDaytimeThreatSweepAt > 12_000) {
    const daytimeThreats = nearbyHostiles(12)
    if (daytimeThreats.length > 0 && !autoState.job) {
      lastDaytimeThreatSweepAt = now
      autoSay(`Daytime sweep: ${daytimeThreats.length} hostile(s) still nearby.`, 8000)
      await survivalTick()
    }
  }

  if (isNight && !autoState.keepDaytime && !nearestHumanPlayer()) {
    autoSay('Night safety pause: staying near shelter.', 12000)
    bot.pathfinder.setGoal(null)
  }

  const inventoryStacks = (bot.inventory.items() || []).length
  if (inventoryStacks > 35) {
    await stashToChest(autoState.job?.owner || cfg.adminUsers[0] || bot.username)
  }

  if (autoState.job?.kind === 'mine') {
    const escaped = await escapeOneByOneTrap()
    if (escaped) return
  }

  if (autoState.job && recentPositions.length >= 5) {
    const step = String(autoState.currentStep || '')
    const allowStuckCheck = step.startsWith('mine:')
    const activelyPathing = !!bot.pathfinder?.goal
    const currentlyDigging = !!bot.targetDigBlock

    if (allowStuckCheck && activelyPathing && !currentlyDigging) {
      const xs = recentPositions.map(p => p.x)
      const zs = recentPositions.map(p => p.z)
      const dx = Math.max(...xs) - Math.min(...xs)
      const dz = Math.max(...zs) - Math.min(...zs)
      const moved = Math.sqrt(dx * dx + dz * dz)

      if (moved < 0.6 && now - lastStuckNudgeAt > 20000) {
        lastStuckNudgeAt = now
        bot.setControlState('jump', true)
        setTimeout(() => bot.setControlState('jump', false), 250)

        const a = nearestAnchorPosition()
        if (a) {
          bot.pathfinder.setGoal(new goals.GoalNear(a.x, a.y, a.z, 3))
        } else {
          const p = bot.entity.position
          bot.pathfinder.setGoal(new goals.GoalNear(p.x + 2, p.y, p.z + 2, 1))
        }

        autoState.lastError = 'stuck-reroute'
        autoSay('Stuck detected: forced reroute.', 12000)
      }
    }
  }

  if (spawnPosition && !followTarget) {
    const distFromSpawn = bot.entity.position.distanceTo(spawnPosition)
    if (distFromSpawn > 200) {
      bot.pathfinder.setGoal(new goals.GoalNear(spawnPosition.x, spawnPosition.y, spawnPosition.z, 4))
      autoSay('Radius safety: returning closer to spawn.', 10000)
    }
  }
}
// --- NEW CODE END: safety rails loop (step 2) ---

function createBot() {
  const startupSkills = loadSkills()
  console.log(`[silasbot] loaded ${Object.keys(startupSkills).length} persisted skills`)
  console.log('[silasbot] creating bot with microsoft auth/device code flow')

  bot = mineflayer.createBot({
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    auth: cfg.auth,
    flow: cfg.authFlow,
    authTitle: Titles.MinecraftJava,
    deviceType: 'Win32',
    version: false,
    hideErrors: false,
    checkTimeoutInterval: 30_000,
    profilesFolder: path.join(__dirname, 'auth-cache')
  })

  bot.loadPlugin(pathfinder)
  bot.loadPlugin(pvp)

  bot.once('spawn', () => {
    const mcData = require('minecraft-data')(bot.version)
    mcDataRef = mcData
    const movement = new Movements(bot, mcData)
    movement.canSwim = false
    movement.allow1by1towers = false
    if (mcData.blocksByName.water) movement.blocksToAvoid.add(mcData.blocksByName.water.id)
    if (mcData.blocksByName.lava) movement.blocksToAvoid.add(mcData.blocksByName.lava.id)
    bot.pathfinder.setMovements(movement)

    say(`Silas online. Mode=${activeMode}. Use !silas help`)
    console.log('[silasbot] spawned')
    // --- NEW CODE START: capture spawn anchor for safety radius ---
    spawnPosition = bot.entity.position.clone()
    // --- NEW CODE END: capture spawn anchor for safety radius ---

    const adminAnchor = Object.values(bot.players || {})
      .map(p => p.entity)
      .find(e => e && isAdmin(e.username))
    if (adminAnchor) {
      followTarget = adminAnchor.username
      bot.pathfinder.setGoal(new goals.GoalFollow(adminAnchor, 2), true)
      say(`Rallying on ${adminAnchor.username} for safety.`)
    }

    if (eventTicker) clearInterval(eventTicker)
    eventTicker = setInterval(() => runWorldEvent(), 20 * 60 * 1000)

    // --- NEW CODE START: dedicated safety rail loop (2s) ---
    if (safetyTicker) clearInterval(safetyTicker)
    safetyTicker = setInterval(() => {
      safetyCheck().catch(() => {})
    }, 2000)
    // --- NEW CODE END: dedicated safety rail loop (2s) ---
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return

    if (!message.toLowerCase().startsWith('!silas')) {
      maybePersonalityReply(username, message)
      return
    }

    const [, cmd = '', ...args] = message.trim().split(/\s+/)
    const command = cmd.toLowerCase()

    if (command === 'help') {
      say('Cmds: follow|come|stay|guard|quest start [type]/status/done/abandon/types|gather|craft|build <plan> [wood|stone]|task|inventory|deposit|stash|chest|daytime on|off|status|auto on|off|status|debug|cancel|mine|craft|build <plan> [wood|stone]|profile|class <type>|checkin|party create/join/leave/status|mode|pvp|event now')
      return
    }

    if (command === 'vibe') {
      const p = getPlayerProfile(username)
      const style = p.buildStyle ? `I remember you like ${p.buildStyle} builds.` : 'I am still learning your style.'
      say(`${style} Title: ${p.title || 'Rookie Builder'}. Use !silas quest start`)
      return
    }

    if (command === 'quest') {
      const sub = (args[0] || 'start').toLowerCase()
      if (sub === 'start') return assignQuest(username, args[1] || 'random')
      if (sub === 'status') return questStatus(username)
      if (sub === 'done') return questAdvance(username)
      if (sub === 'abandon') return questAbandon(username)
      if (sub === 'types') return say(questTypesHint())
      return say('Use !silas quest start [type]|status|done|abandon|types')
    }

    if (command === 'profile') return profileSummary(username)

    if (command === 'class') {
      if (!args[0]) return say(`Your class: ${getPlayerProfile(username).classType || 'unassigned'}. Pick: ${classes.join(', ')}`)
      return setClass(username, args[0].toLowerCase())
    }

    if (command === 'checkin') return checkin(username)

    if (command === 'party') {
      const sub = (args[0] || '').toLowerCase()
      if (sub === 'create') return partyCreate(username, args[1])
      if (sub === 'join') return partyJoin(username, args[1])
      if (sub === 'leave') return partyLeave(username)
      if (sub === 'status') return partyStatus(username)
      return say('Use !silas party create <name>|join <name>|leave|status')
    }

    if (command === 'gather') return startGatherMission(username, args[0], args[1])

    if (command === 'craft') return startCraftMission(username, args[0], args[1])

    if (command === 'build') return startBuildMission(username, args[0], args[1])

    if (command === 'task') return startTaskMission(username, args.join(' '))

    if (command === 'inventory') return inventorySummary()

    if (command === 'deposit') {
      depositToPlayer(username).catch(() => say('Could not complete deposit right now.'))
      return
    }

    if (command === 'stash') {
      stashToChest(username).catch(() => say('Could not stash into chest right now.'))
      return
    }

    if (command === 'chest') {
      ensureSharedChestReady().then(s => {
        if (s.ready) say('Shared chest ready.')
      }).catch(() => say('Could not prepare chest right now.'))
      return
    }

    if (command === 'daytime') {
      const sub = (args[0] || 'status').toLowerCase()
      if (sub === 'on') {
        autoState.keepDaytime = true
        autoState.lastDaytimeSetAt = 0
        bot.chat('/time set day')
        return say('Daytime lock ON for testing.')
      }
      if (sub === 'off') {
        autoState.keepDaytime = false
        return say('Daytime lock OFF.')
      }
      return say(`Daytime lock is ${autoState.keepDaytime ? 'ON' : 'OFF'}. Use !silas daytime on|off`)
    }

    if (command === 'auto') {
      const sub = (args[0] || '').toLowerCase()
      if (sub === 'on') {
        autoState.enabled = true
        return say('Auto mode ON. Use !silas auto mine|craft|build ...')
      }
      if (sub === 'off') {
        autoState.enabled = false
        stopAutoJob(null)
        return say('Auto mode OFF.')
      }
      if (sub === 'status') return autoStatus()
      if (sub === 'debug') return autoDebugStatus()
      if (sub === 'cancel') return stopAutoJob('Auto job cancelled.')
      if (sub === 'mine') return startAutoMine(username, args[1], args[2])
      if (sub === 'craft') return startAutoCraft(username, args[1], args[2])
      if (sub === 'build') return startAutoBuild(username, args[1], args[2])
      // --- NEW CODE START: step 5 auto gather alias ---
      if (sub === 'gather') return startAutoMine(username, args[1], args[2])
      // --- NEW CODE END: step 5 auto gather alias ---
      return say('Use: !silas auto on|off|status|debug|cancel|mine <target> <amount>|craft <item> <amount>|build <plan> [wood|stone]|gather <target> <amount>')
    }

    if (command === 'style') {
      const style = args.join(' ')
      if (!style) return say('Use: !silas style <description>')
      setPlayerProfile(username, { buildStyle: style })
      say(`Got it ${username}, noted your style: ${style}`)
      awardXp(username, 15, 'style-set')
      return
    }

    if (command === 'event') {
      const sub = (args[0] || '').toLowerCase()
      if (sub !== 'now') return say('Use !silas event now')
      if (!isAdmin(username)) return say('Only admins can force events.')
      runWorldEvent(username)
      return
    }

    if (command === 'follow') {
      const targetName = args[0] || username
      const target = bot.players[targetName]?.entity
      if (!target) return say(`I cannot see ${targetName} right now.`)
      followTarget = targetName
      guardTarget = null
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true)
      say(`On your six, ${targetName}.`)
      return
    }

    if (command === 'stay') {
      followTarget = null
      guardTarget = null
      bot.pathfinder.setGoal(null)
      bot.pvp.stop()
      say('Holding position.')
      return
    }

    if (command === 'come') {
      const player = bot.players[username]?.entity
      if (!player) {
        if (isAdmin(username)) {
          bot.chat(`/tp ${bot.username} ${username}`)
          return say(`I cannot path to you yet, ${username}. Attempting teleport fallback.`)
        }
        return say(`I cannot see you, ${username}.`)
      }
      followTarget = null
      guardTarget = null
      bot.pathfinder.setGoal(new goals.GoalNear(player.position.x, player.position.y, player.position.z, 2))
      say(`Moving to your location, ${username}.`)
      return
    }

    if (command === 'guard') {
      const targetName = args[0] || username
      if (!bot.players[targetName]?.entity) return say(`I cannot see ${targetName}.`)
      guardTarget = targetName
      followTarget = null
      say(`Guardian mode enabled for ${targetName}.`)
      return
    }

    if (command === 'mode') {
      if (!isAdmin(username)) return say('Only admins can change mode.')
      const wanted = (args[0] || '').toLowerCase()
      if (!['family', 'mayhem'].includes(wanted)) return say('Use: !silas mode family|mayhem')
      activeMode = wanted
      say(`Mode switched to ${activeMode}.`)
      return
    }

    if (command === 'pvp') {
      const state = (args[0] || '').toLowerCase()
      if (state === 'off') {
        bot.pvp.stop()
        return say('PvP disengaged.')
      }
      if (state === 'on') {
        if (activeMode !== 'mayhem') return say('PvP requires mayhem mode. Use !silas mode mayhem')
        const target = bot.nearestEntity(e => e.type === 'player' && e.username !== bot.username)
        if (!target) return say('No nearby PvP target found.')
        bot.pvp.attack(target)
        return say(`Engaging ${target.username}. All is fair in love and minecraft.`)
      }
      return say('Use: !silas pvp on|off')
    }
  })

  bot.on('physicsTick', () => {
    if (!bot.entity) return

    if (followTarget) {
      const entity = bot.players[followTarget]?.entity
      if (entity) bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2), true)
    }

    if (guardTarget && activeMode === 'mayhem') {
      const guardEntity = bot.players[guardTarget]?.entity
      if (!guardEntity) return
      const threat = bot.nearestEntity(e => e.type === 'player' && e.username !== guardTarget && e.username !== bot.username && e.position.distanceTo(guardEntity.position) < 5)
      if (threat && !bot.pvp.target) bot.pvp.attack(threat)
    }

    if (Date.now() - lastSurvivalTickAt > 3000) {
      lastSurvivalTickAt = Date.now()
      survivalTick().catch(() => {})
      autoTick().catch(() => {})
    }
  })

  bot.on('kicked', reason => console.error('[silasbot] kicked:', reason))
  bot.on('error', err => console.error('[silasbot] error:', err.message))

  bot.on('end', () => {
    if (safetyTicker) {
      clearInterval(safetyTicker)
      safetyTicker = null
    }
    console.log('[silasbot] disconnected, reconnecting in 15s')
    setTimeout(createBot, 15_000)
  })
}

createBot()
