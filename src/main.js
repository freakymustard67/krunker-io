import * as THREE from 'three'
import PlayerController from './PlayerController.js'
import Weapon from './Weapon.js'
import World from './World.js'
import Bot from './Bot.js'
import BulletFX from './BulletFX.js'
import SoundFX from './SoundFX.js'
import Equipment from './Equipment.js'
import HUD, { showClassSelect } from './HUD.js'
import { BOT_COUNT, PLAYER_RADIUS, CLASSES } from './constants.js'
import { randInt } from './utils.js'

async function init() {
  const blocker = document.getElementById('blocker')
  const hudEl = document.getElementById('hud')

  // Class select first
  const chosenClass = await showClassSelect()

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  document.body.prepend(renderer.domElement)

  const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 220)
  const scene = new THREE.Scene()
  const world = new World(scene)

  const player = new PlayerController(camera, scene)
  player.applyClass(chosenClass)
  player.teleport(world.spawnPoints[0].x, world.spawnPoints[0].z)
  player.spawnPoints = world.spawnPoints

  const weapon = new Weapon(camera, scene)
  weapon.setClass(chosenClass)

  const sfx = new SoundFX()
  weapon.sfx = sfx

  const fx = new BulletFX(scene)
  const clock = new THREE.Clock()

  // Bots with varied classes
  const bots = []
  const botMeshes = []
  for (let i = 0; i < BOT_COUNT; i++) {
    const sp = world.spawnPoints[(i + 1) % world.spawnPoints.length]
    const bot = new Bot(scene, i, sp, world.boxes, i % CLASSES.length)
    bots.push(bot)
    botMeshes.push(bot.mesh)
  }

  // Local player body (visible for bot hit detection; hidden from camera via layers optional)
  const playerMesh = new THREE.Group()
  const bodyMat = new THREE.MeshLambertMaterial({ color: chosenClass.color })
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffccaa })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.65, 0.32), bodyMat)
  body.position.y = 0.95
  playerMesh.add(body)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), headMat)
  head.position.y = 1.42
  playerMesh.add(head)
  // Hide from own camera by rendering only shadows-ish — keep simple: offset not needed, bots raycast it
  playerMesh.visible = true
  scene.add(playerMesh)
  player.playerMesh = playerMesh

  weapon.setTargets(botMeshes, world.meshes)

  const gameState = {
    world,
    bots,
    matchEnded: false,
    respawn: () => {
      if (gameState.matchEnded) return
      const sp = world.spawnPoints[randInt(0, world.spawnPoints.length - 1)]
      player.teleport(sp.x, sp.z)
      weapon.resetAmmo()
      hud.hideDeath()
    },
    endMatch: () => {
      gameState.matchEnded = true
      const board = [
        { name: player.name, score: player.score },
        ...bots.map((b) => ({ name: b.name, score: b.score })),
      ]
      board.sort((a, b) => b.score - a.score)
      hud.showMatchEnd(board[0]?.name || '???')
      document.exitPointerLock?.()
    },
    changeClass: async () => {
      document.exitPointerLock?.()
      const cls = await showClassSelect()
      player.applyClass(cls)
      weapon.setClass(cls)
      bodyMat.color.setHex(cls.color)
      gameState.respawn()
    },
  }

  const hud = new HUD(player, weapon, gameState)
  weapon.hud = hud

  const equipment = new Equipment(scene, world.boxes, player, bots, fx, hud)

  weapon.onKill = (bot, headshot, melee) => {
    hud.addKill('You', bot.name, headshot, melee)
  }

  // Change class with M
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !gameState.matchEnded) {
      gameState.changeClass()
    }
  })

  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && document.pointerLockElement && player.alive && !weapon.current.auto) {
      weapon.fire(botMeshes, world.meshes, fx, player)
    }
  })

  blocker.addEventListener('click', () => {
    if (gameState.matchEnded) return
    if (document.getElementById('class-select')?.style.display === 'flex') return
    renderer.domElement.requestPointerLock()
  })

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) {
      blocker.style.display = 'none'
      hudEl.style.display = 'block'
    } else if (player.alive && !gameState.matchEnded) {
      const cs = document.getElementById('class-select')
      if (cs?.style.display === 'flex') return
      blocker.style.display = 'flex'
      blocker.innerHTML = `
        <h1>PAUSED</h1>
        <p>Click to resume</p>
        <p class="hint">WASD move · Space jump · Shift slide · C crouch · R reload<br>
        1/2/3 weapons · RMB aim · G grenade · M change class · J inspect · Tab scoreboard</p>
      `
    }
  })

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // Show play prompt after class select
  blocker.style.display = 'flex'
  blocker.innerHTML = `
    <h1>KRUNKER.IO</h1>
    <p class="class-picked">${chosenClass.name}</p>
    <p>Click to Play</p>
    <p class="hint">WASD · Jump · Slide (Shift) · Crouch (C) · ADS (RMB)<br>
    1 Primary · 2 Pistol · 3 Knife · G Grenade · M Class · J Inspect · Tab Scores</p>
  `
  hudEl.style.display = 'none'

  function animate() {
    requestAnimationFrame(animate)
    const dt = Math.min(clock.getDelta(), 0.05)

    player.update(dt, world.boxes, world)

    // ADS FOV
    let targetFov = 80
    if (player.ads && player.alive) {
      targetFov = 80 / (weapon.current.adsZoom || 1)
    }
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12)
    camera.updateProjectionMatrix()

    // Player mesh follows (hidden from self by keeping behind camera — still for hits)
    playerMesh.position.copy(player.position)
    if (player.alive) {
      playerMesh.rotation.x = 0
      playerMesh.rotation.y = player.yaw.rotation.y
      // Hide body from first-person view by making it invisible to own cam:
      // simple approach: only show when dead
      playerMesh.visible = false
    } else {
      playerMesh.visible = true
      playerMesh.rotation.x = -Math.PI / 2
      playerMesh.position.y = player.position.y + 0.3
    }

    weapon.update(dt, player)

    if (player.alive && document.pointerLockElement && !gameState.matchEnded) {
      if (weapon.current.auto && player.mouseDown) {
        weapon.fire(botMeshes, world.meshes, fx, player)
      }
    }

    for (const bot of bots) {
      bot.update(dt, player, world.boxes, world.meshes, fx, world)
    }

    // Soft separation vs bots
    if (player.alive) {
      for (const bot of bots) {
        if (!bot.alive) continue
        const dist = bot.pos.distanceTo(player.position)
        if (dist < PLAYER_RADIUS + 0.4 && dist > 0.01) {
          const push = new THREE.Vector3()
            .copy(player.position)
            .sub(bot.pos)
            .normalize()
            .multiplyScalar(dt * 4)
          player.position.x += push.x
          player.position.z += push.z
        }
      }
    }

    fx.update(dt)
    equipment.update(dt)
    hud.update(dt)

    renderer.render(scene, camera)
  }

  animate()
}

init()
