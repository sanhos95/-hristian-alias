<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BIBLE_NAMES } from './data/bibleNames'
import { BIBLE_CITIES } from './data/bibleCities'
import { BIBLE_EVENTS } from './data/bibleEvents'
import { BIBLE_STORIES } from './data/bibleStories'

const roundSeconds = ref(90)
const LS_KEY = 'alias:bible:v1'
const secondsLeft = ref(roundSeconds.value)
const running = ref(false)
const timeUp = ref(false)
const correct = ref(0)
const passed = ref(0)
const seen = ref(new Set())
const globalSeen = ref(new Set())
const history = ref([])
const screen = ref('setup')
const mode = ref('solo')
const teamA = ref('')
const teamB = ref('')
const playersA = ref(2)
const playersB = ref(2)
const activeTeam = ref('A')
const playerIndexA = ref(0)
const playerIndexB = ref(0)
const totalA = ref({ correct: 0, passed: 0 })
const totalB = ref({ correct: 0, passed: 0 })
const lastTurn = ref(null)
const resultsOpen = ref(false)
const exhausted = ref(false)

let t = 0

function ensureTimerRunning() {
  if (!running.value || timeUp.value || secondsLeft.value <= 0) return
  clearInterval(t)
  t = window.setInterval(() => {
    secondsLeft.value--
    if (secondsLeft.value <= 0) {
      secondsLeft.value = 0
      timeUp.value = true
      clearInterval(t)
    }
  }, 1000)
}

const storiesPool = computed(() => [...BIBLE_STORIES, ...BIBLE_EVENTS])
const allPool = computed(() => [...BIBLE_NAMES, ...BIBLE_CITIES, ...storiesPool.value])
const pool = computed(() => allPool.value)

const citySet = new Set(BIBLE_CITIES)
const eventSet = new Set(BIBLE_EVENTS)
const storySet = new Set(BIBLE_STORIES)

const cardBadge = computed(() => {
  // Визначаємо тип картки по значенню (працює і для "Все").
  const v = current.value
  if (citySet.has(v)) return 'Місто'
  if (eventSet.has(v) || storySet.has(v)) return 'Історія'
  return 'Імʼя'
})

function pickNext() {
  // Псевдо-випадкова "торба": без повторів у категорії + глобально на пристрої.
  const list = pool.value
  const remaining = list.filter((x) => !globalSeen.value.has(x))
  if (remaining.length === 0) return ''
  if (seen.value.size >= list.length) seen.value = new Set()
  let name = ''
  while (!name || seen.value.has(name) || globalSeen.value.has(name)) name = remaining[(Math.random() * remaining.length) | 0]
  seen.value.add(name)
  globalSeen.value.add(name)
  return name
}

const current = ref(pickNext())

function nextCard() {
  const n = pickNext()
  if (!n) {
    exhausted.value = true
    endRound()
    return
  }
  current.value = n
}

const canStart = computed(() => mode.value !== 'team' || (teamA.value.trim() && teamB.value.trim()))
const activeTeamName = computed(() => (activeTeam.value === 'A' ? teamA.value || 'Команда 1' : teamB.value || 'Команда 2'))
const activePlayerNumber = computed(() => {
  const idx = activeTeam.value === 'A' ? playerIndexA.value : playerIndexB.value
  return idx + 1
})
const totalScoreA = computed(() => totalA.value.correct - totalA.value.passed)
const totalScoreB = computed(() => totalB.value.correct - totalB.value.passed)

function start() {
  if (running.value || !canStart.value) return
  screen.value = 'game'
  // Новий раунд завжди стартує з чистого стану.
  correct.value = 0
  passed.value = 0
  history.value = []
  seen.value = new Set()
  exhausted.value = false
  lastTurn.value = null
  if (mode.value === 'team') {
    activeTeam.value = 'A'
    playerIndexA.value = 0
    playerIndexB.value = 0
    totalA.value = { correct: 0, passed: 0 }
    totalB.value = { correct: 0, passed: 0 }
  }
  const first = pickNext()
  if (!first) {
    exhausted.value = true
    return
  }
  current.value = first
  running.value = true
  timeUp.value = false
  secondsLeft.value = roundSeconds.value
  ensureTimerRunning()
}

function endRound(recordTurn = true) {
  running.value = false
  clearInterval(t)
  if (recordTurn && screen.value === 'game') {
    lastTurn.value = {
      team: mode.value === 'team' ? activeTeam.value : null,
      teamName: mode.value === 'team' ? activeTeamName.value : null,
      playerNumber: mode.value === 'team' ? activePlayerNumber.value : null,
      correct: correct.value,
      passed: passed.value,
      score: score.value,
      at: Date.now(),
    }
    if (mode.value === 'team') {
      const bucket = activeTeam.value === 'A' ? totalA : totalB
      bucket.value = {
        correct: bucket.value.correct + correct.value,
        passed: bucket.value.passed + passed.value,
      }
    }
  }
  resultsOpen.value = true
}

function closeResults() {
  resultsOpen.value = false
}

function replaySolo() {
  if (mode.value === 'team') return
  closeResults()
  start()
}

function nextTeamTurn() {
  if (mode.value !== 'team') return
  // Переходимо до наступної команди, гравці можуть бути у різній кількості.
  activeTeam.value = activeTeam.value === 'A' ? 'B' : 'A'
  if (activeTeam.value === 'A') playerIndexA.value = (playerIndexA.value + 1) % Math.max(1, playersA.value | 0)
  else playerIndexB.value = (playerIndexB.value + 1) % Math.max(1, playersB.value | 0)

  correct.value = 0
  passed.value = 0
  history.value = []
  timeUp.value = false
  secondsLeft.value = roundSeconds.value

  const n = pickNext()
  if (!n) {
    exhausted.value = true
    resultsOpen.value = false
    endRound(false)
    return
  }
  current.value = n
  resultsOpen.value = false
  running.value = true
  ensureTimerRunning()
}

function mark(result) {
  if (!running.value) return
  if (result === 'ok') correct.value++
  else passed.value++
  history.value.unshift({ name: current.value, result, at: Date.now() })
  if (timeUp.value) endRound()
  else nextCard()
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return
    const s = JSON.parse(raw)
    if (s?.mode) mode.value = s.mode
    if (typeof s?.roundSeconds === 'number') roundSeconds.value = s.roundSeconds
    if (typeof s?.teamA === 'string') teamA.value = s.teamA
    if (typeof s?.teamB === 'string') teamB.value = s.teamB
    if (s?.screen) screen.value = s.screen
    if (typeof s?.secondsLeft === 'number') secondsLeft.value = s.secondsLeft
    if (typeof s?.running === 'boolean') running.value = s.running
    if (typeof s?.timeUp === 'boolean') timeUp.value = s.timeUp
    if (typeof s?.correct === 'number') correct.value = s.correct
    if (typeof s?.passed === 'number') passed.value = s.passed
    if (Array.isArray(s?.history)) history.value = s.history
    if (Array.isArray(s?.seen)) seen.value = new Set(s.seen)
    if (Array.isArray(s?.globalSeen)) globalSeen.value = new Set(s.globalSeen)
    if (typeof s?.current === 'string' && s.current) current.value = s.current
    ensureTimerRunning()
  } catch {
    // Ігноруємо битий storage.
  }
}

function saveState() {
  try {
    window.localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        mode: mode.value,
        roundSeconds: roundSeconds.value,
        teamA: teamA.value,
        teamB: teamB.value,
        screen: screen.value,
        secondsLeft: secondsLeft.value,
        running: running.value,
        timeUp: timeUp.value,
        correct: correct.value,
        passed: passed.value,
        history: history.value,
        current: current.value,
        seen: [...seen.value],
        globalSeen: [...globalSeen.value],
      }),
    )
  } catch {
    // Нічого не робимо, якщо storage недоступний.
  }
}

watch([mode, roundSeconds, teamA, teamB, screen, secondsLeft, running, timeUp, correct, passed, history, current], saveState, {
  deep: true,
})
watch([seen, globalSeen], saveState, { deep: true })

function backToSetup() {
  endRound(false)
  resultsOpen.value = false
  screen.value = 'setup'
}

const score = computed(() => correct.value - passed.value)
const progress = computed(() => {
  const total = Math.max(1, roundSeconds.value)
  return Math.max(0, Math.min(100, Math.round((secondsLeft.value / total) * 100)))
})

onBeforeUnmount(() => clearInterval(t))

function onKeydown(e) {
  if (e.key === 'Escape' && resultsOpen.value) closeResults()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
onMounted(() => loadState())
</script>

<template>
  <main
    class="min-h-dvh overflow-x-hidden bg-gradient-to-b from-[#0B1020] via-[#0B1020] to-[#070A14] text-white"
  >
    <div
      class="mx-auto flex min-h-dvh max-w-5xl min-w-0 flex-col px-3 py-4 sm:px-4 sm:py-5 lg:py-12"
    >
      <header v-if="screen === 'setup'" class="flex flex-col gap-3">
        <div class="space-y-1">
          <div>Налаштування</div>
          <h1 class="text-xl font-semibold tracking-tight sm:text-2xl">Гра “Аліас”</h1>
          <div class="text-sm text-white/60">Біблійні слова · раунд на вибраний час</div>
        </div>
      </header>

      <header v-else class="space-y-1.5">
        <div class="text-sm font-medium">Гра</div>
        <div class="flex min-w-0 items-center justify-between gap-2">
          <div class="min-w-0 flex-1 truncate text-xs text-white/60">
            <span v-if="mode === 'team'">Хід: {{ activeTeamName }} · №{{ activePlayerNumber }}</span>
            <span v-else>Одиночна</span>
          </div>
          <button
            class="shrink-0 rounded-xl bg-white/5 px-2.5 py-1.5 text-xs font-semibold ring-1 ring-white/10 hover:bg-white/10"
            type="button"
            aria-label="Налаштування"
            @click="backToSetup"
          >
            Налашт.
          </button>
        </div>
      </header>

      <section v-if="screen === 'setup'" class="mt-6 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 p-6 ring-1 ring-white/10">
        <div class="mt-6 text-sm font-semibold text-white/90">Час раунду</div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            class="rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ring-white/10"
            :class="roundSeconds === 10 ? 'bg-white/10 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'"
            type="button"
            @click="() => (roundSeconds = 10)"
          >
            0:10
          </button>
          <button
            class="rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ring-white/10"
            :class="roundSeconds === 60 ? 'bg-white/10 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'"
            type="button"
            @click="() => (roundSeconds = 60)"
          >
            1:00
          </button>
          <button
            class="rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ring-white/10"
            :class="roundSeconds === 90 ? 'bg-white/10 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'"
            type="button"
            @click="() => (roundSeconds = 90)"
          >
            1:30
          </button>
          <button
            class="rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ring-white/10"
            :class="roundSeconds === 120 ? 'bg-white/10 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'"
            type="button"
            @click="() => (roundSeconds = 120)"
          >
            2:00
          </button>
        </div>

        <div class="mt-6 text-sm font-semibold text-white/90">Режим</div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            class="rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ring-white/10"
            :class="mode === 'solo' ? 'bg-white/10 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'"
            type="button"
            @click="() => (mode = 'solo')"
          >
            Одиночна
          </button>
          <button
            class="rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ring-white/10"
            :class="mode === 'team' ? 'bg-white/10 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'"
            type="button"
            @click="() => (mode = 'team')"
          >
            Командна
          </button>
        </div>

        <div v-if="mode === 'team'" class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="block">
            <div class="mb-1 text-xs text-white/60">Команда 1</div>
            <input
              v-model="teamA"
              class="w-full rounded-2xl bg-black/30 px-4 py-3 text-sm text-white ring-1 ring-white/10 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
              placeholder="Наприклад: Леви"
              type="text"
              autocomplete="off"
            />
          </label>
          <label class="block">
            <div class="mb-1 text-xs text-white/60">Команда 2</div>
            <input
              v-model="teamB"
              class="w-full rounded-2xl bg-black/30 px-4 py-3 text-sm text-white ring-1 ring-white/10 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
              placeholder="Наприклад: Орли"
              type="text"
              autocomplete="off"
            />
          </label>
          <label class="block">
            <div class="mb-1 text-xs text-white/60">Гравців у команді 1</div>
            <input
              v-model.number="playersA"
              class="w-full rounded-2xl bg-black/30 px-4 py-3 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
              type="number"
              min="1"
              step="1"
            />
          </label>
          <label class="block">
            <div class="mb-1 text-xs text-white/60">Гравців у команді 2</div>
            <input
              v-model.number="playersB"
              class="w-full rounded-2xl bg-black/30 px-4 py-3 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
              type="number"
              min="1"
              step="1"
            />
          </label>
        </div>

        <div class="mt-6 flex items-center justify-between gap-3">
          <div class="text-xs text-white/60">Вибрано: {{ mode === 'team' ? 'командна' : 'одиночна' }}</div>
          <button
            class="rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 hover:bg-indigo-400 disabled:opacity-50"
            type="button"
            :disabled="!canStart"
            @click="start"
          >
            Почати гру
          </button>
        </div>
      </section>

      <template v-else>
        <div
          class="mt-3 flex min-h-0 flex-1 flex-col gap-2 sm:mt-4 sm:gap-3 lg:grid lg:min-h-0 lg:grid-cols-[1fr_360px] lg:items-start lg:gap-4"
        >
          <section class="min-w-0 rounded-3xl bg-gradient-to-b from-white/10 to-white/5 p-4 ring-1 ring-white/10 sm:p-6">
            <div class="flex min-w-0 items-center justify-between gap-2 sm:items-start sm:gap-4">
              <div class="min-w-0 flex-1 text-xs leading-snug text-white/60 sm:leading-normal">
                Пояснюй словами, не називаючи прямо
              </div>
              <div
                class="shrink-0 rounded-xl bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/80 ring-1 ring-white/10 sm:rounded-2xl sm:px-3 sm:py-2"
              >
                {{ Math.floor(secondsLeft / 60) }}:{{ String(secondsLeft % 60).padStart(2, '0') }}
              </div>
            </div>

            <div class="mt-3 rounded-2xl bg-black/30 p-5 text-center ring-1 ring-white/10 sm:mt-4 sm:p-10">
              <div v-if="running" class="space-y-4">
                <div class="flex justify-center">
                  <span class="rounded-full bg-indigo-400/15 px-3 py-1 text-xs font-semibold text-indigo-100 ring-1 ring-indigo-300/30">
                    {{ cardBadge }}
                  </span>
                </div>
                <div class="break-words text-3xl font-semibold tracking-tight sm:text-6xl">{{ current }}</div>
              </div>
              <div v-else class="text-base font-medium text-white/60">
                Натисніть “Старт”, щоб показати перше слово.
              </div>
            </div>

            <div class="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
              <button
                class="rounded-2xl bg-emerald-500 px-4 py-3 text-base font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50 sm:py-4"
                type="button"
                :disabled="!running"
                @click="() => mark('ok')"
              >
                Вгадано
              </button>
              <button
                class="rounded-2xl bg-white/5 px-4 py-3 text-base font-semibold ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50 sm:py-4"
                type="button"
                :disabled="!running"
                @click="() => mark('pass')"
              >
                Пас
              </button>
            </div>
          </section>

          <aside class="space-y-3 lg:space-y-4">
            <section class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-1">
              <div class="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 sm:p-4">
                <div class="text-xs text-white/60">Рахунок</div>
                <div class="mt-1 text-xl tabular-nums sm:text-2xl">{{ score }}</div>
                <div class="mt-1 text-xs text-white/60 sm:mt-2 sm:text-sm">Вгадано: {{ correct }} · Пас: {{ passed }}</div>
              </div>
              <div class="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 sm:p-4">
                <div class="text-xs text-white/60">Прогрес</div>
                <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/10 sm:mt-3">
                  <div class="h-full bg-indigo-400" :style="{ width: progress + '%' }" />
                </div>
                <div v-if="timeUp" class="mt-2 text-xs font-semibold text-amber-300">
                  Час вийшов — дозавершіть це слово.
                </div>
              </div>
              <div class="hidden rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 sm:block">
                <div class="text-xs text-white/60">Правило фінішу</div>
                <div class="mt-1 text-sm text-white/70">Після 0:00 можна завершити поточне слово.</div>
              </div>
            </section>

            <section class="hidden rounded-3xl bg-white/5 p-4 ring-1 ring-white/10 lg:block">
              <div class="mb-3 flex items-center justify-between">
                <h2 class="text-sm font-semibold text-white/90">Історія</h2>
                <div class="text-xs text-white/50">останні 10</div>
              </div>
              <ul class="space-y-2">
                <li
                  v-for="(h, i) in history.slice(0, 10)"
                  :key="h.at + ':' + i"
                  class="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10"
                >
                  <span class="truncate text-white/90">{{ h.name }}</span>
                  <span
                    class="ml-3 shrink-0 rounded-lg px-2 py-1 text-xs font-semibold"
                    :class="h.result === 'ok' ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/25' : 'bg-white/5 text-white/70 ring-1 ring-white/10'"
                  >
                    {{ h.result === 'ok' ? 'OK' : 'PASS' }}
                  </span>
                </li>
                <li v-if="history.length === 0" class="text-sm text-white/60">
                  Натисніть “Старт”, пояснюйте — і відмічайте результат.
                </li>
              </ul>
              <div v-if="exhausted" class="mt-3 text-xs font-semibold text-amber-300">
                Картки закінчились — на цьому пристрої повторів більше не буде.
              </div>
            </section>
          </aside>
        </div>
      </template>
    </div>

    <div
      v-if="resultsOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Результат раунду"
      @click.self="closeResults"
    >
      <div class="w-full max-w-md rounded-3xl bg-[#0F1733] p-5 ring-1 ring-white/10">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-xs text-white/60">Результат</div>
            <div class="mt-1 text-xl font-semibold">Рахунок: {{ score }}</div>
            <div v-if="mode === 'team' && lastTurn?.teamName" class="mt-1 text-xs text-white/60">
              {{ lastTurn.teamName }} · гравець №{{ lastTurn.playerNumber }}
            </div>
          </div>
          <button
            class="grid h-10 w-10 place-items-center rounded-2xl bg-white/5 text-white/80 ring-1 ring-white/10 hover:bg-white/10"
            type="button"
            aria-label="Закрити"
            @click="closeResults"
          >
            ×
          </button>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3">
          <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div class="text-xs text-white/60">Вгадано</div>
            <div class="mt-1 text-2xl tabular-nums">{{ correct }}</div>
          </div>
          <div class="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div class="text-xs text-white/60">Пас</div>
            <div class="mt-1 text-2xl tabular-nums">{{ passed }}</div>
          </div>
        </div>

        <div class="mt-4 text-xs text-white/60">
          Закрийте хрестиком або клавішею Esc.
        </div>

        <div v-if="mode === 'team'" class="mt-4 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <div class="mb-2 text-xs font-semibold text-white/80">Загальний рахунок</div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-2xl bg-black/20 p-3 ring-1 ring-white/10">
              <div class="text-xs text-white/60">{{ teamA || 'Команда 1' }}</div>
              <div class="mt-1 text-lg font-semibold tabular-nums">{{ totalScoreA }}</div>
            </div>
            <div class="rounded-2xl bg-black/20 p-3 ring-1 ring-white/10">
              <div class="text-xs text-white/60">{{ teamB || 'Команда 2' }}</div>
              <div class="mt-1 text-lg font-semibold tabular-nums">{{ totalScoreB }}</div>
            </div>
          </div>
        </div>

        <button
          v-if="mode === 'team'"
          class="mt-4 w-full rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 hover:bg-indigo-400"
          type="button"
          @click="nextTeamTurn"
        >
          Передати хід іншій команді
        </button>

        <button
          v-else
          class="mt-4 w-full rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 hover:bg-indigo-400"
          type="button"
          @click="replaySolo"
        >
          Грати знову
        </button>
      </div>
    </div>
  </main>
</template>
