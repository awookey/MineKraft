'use strict'

const assert = require('node:assert/strict')

const mineflayer = require('mineflayer')
const autoEat = require('mineflayer-auto-eat')
const collectBlock = require('mineflayer-collectblock')
const pathfinder = require('mineflayer-pathfinder')
const pvp = require('mineflayer-pvp')
const tool = require('mineflayer-tool')
const uuid = require('uuid')

assert.equal(typeof mineflayer.createBot, 'function', 'mineflayer createBot export')
assert.equal(typeof autoEat.loader, 'function', 'mineflayer-auto-eat v5 loader export')
assert.equal(typeof collectBlock.plugin, 'function', 'collectblock plugin export')
assert.equal(typeof pathfinder.pathfinder, 'function', 'pathfinder plugin export')
assert.equal(typeof pvp.plugin, 'function', 'pvp plugin export')
assert.equal(typeof tool.plugin, 'function', 'tool plugin export')

const generated = uuid.v4()
assert.equal(uuid.validate(generated), true, 'uuid v4 must validate')
assert.equal(uuid.version(generated), 4, 'uuid v4 version marker')
assert.equal(require('uuid/package.json').version, '11.1.1', 'security override must remain active')

console.log('dependency smoke: PASS')
