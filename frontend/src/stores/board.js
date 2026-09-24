import { defineStore } from 'pinia'
import { ref } from 'vue'
import { boardApi, columnApi, cardApi } from '../api/index.js'

export const useBoardStore = defineStore('board', () => {
  const boards = ref([])
  const currentBoard = ref(null)
  const columns = ref([])
  const cards = ref({}) // keyed by columnId -> [cards]
  const loading = ref(false)

  // Board actions
  async function fetchBoards() {
    loading.value = true
    try {
      const res = await boardApi.list()
      boards.value = res.data
    } finally {
      loading.value = false
    }
  }

  async function createBoard(name, description) {
    const res = await boardApi.create(name, description)
    boards.value.unshift(res.data)
    return res.data
  }

  async function deleteBoard(id) {
    await boardApi.delete(id)
    boards.value = boards.value.filter(b => b.id !== id)
  }

  // Column actions
  async function fetchColumns(boardId) {
    loading.value = true
    try {
      const res = await columnApi.list(boardId)
      columns.value = res.data
      // Initialize cards map
      cards.value = {}
      for (const col of res.data) {
        cards.value[col.id] = []
      }
    } finally {
      loading.value = false
    }
  }

  async function addColumn(boardId, name) {
    const res = await columnApi.create(boardId, name)
    columns.value.push(res.data)
    cards.value[res.data.id] = []
    return res.data
  }

  async function renameColumn(colId, name) {
    const res = await columnApi.update(colId, { name })
    const idx = columns.value.findIndex(c => c.id === colId)
    if (idx !== -1) columns.value[idx] = res.data
    return res.data
  }

  async function deleteColumn(colId) {
    await columnApi.delete(colId)
    columns.value = columns.value.filter(c => c.id !== colId)
    delete cards.value[colId]
  }

  async function reorderColumn(colId, newPosition) {
    const res = await columnApi.update(colId, { position: newPosition })
    // Refresh columns to get correct order
    if (currentBoard.value) {
      await fetchColumns(currentBoard.value.id)
    }
    return res.data
  }

  // Card actions
  async function fetchCards(columnId) {
    const res = await cardApi.list(columnId)
    cards.value[columnId] = res.data
    return res.data
  }

  async function fetchAllCards(boardId) {
    // Fetch cards for all columns in parallel
    const cols = columns.value
    const promises = cols.map(col => cardApi.list(col.id))
    const results = await Promise.all(promises)
    cols.forEach((col, i) => {
      cards.value[col.id] = results[i].data
    })
  }

  async function addCard(columnId, data) {
    const res = await cardApi.create(columnId, data)
    if (!cards.value[columnId]) cards.value[columnId] = []
    cards.value[columnId].push(res.data)
    return res.data
  }

  async function updateCard(cardId, data) {
    const res = await cardApi.update(cardId, data)
    // Update card in the local state
    for (const colId in cards.value) {
      const idx = cards.value[colId].findIndex(c => c.id === cardId)
      if (idx !== -1) {
        cards.value[colId][idx] = res.data
        break
      }
    }
    return res.data
  }

  async function deleteCard(cardId) {
    await cardApi.delete(cardId)
    for (const colId in cards.value) {
      cards.value[colId] = cards.value[colId].filter(c => c.id !== cardId)
    }
  }

  async function moveCard(cardId, targetColumnId, position) {
    // Find the source column before the move so we can re-fetch every
    // affected column afterwards. Never patch a moved card by hand: the
    // server response is the source of truth, otherwise stale fields such as
    // column_id/due_date (and derived overdue state) linger after the move.
    let sourceColumnId = null
    for (const colId in cards.value) {
      if (cards.value[colId].some(c => c.id === cardId)) {
        sourceColumnId = Number(colId)
        break
      }
    }

    try {
      await cardApi.move(cardId, targetColumnId, position)

      const columnsToRefresh = new Set(
        [sourceColumnId, targetColumnId].filter(id => id !== null && cards.value[id] !== undefined)
      )
      await Promise.all([...columnsToRefresh].map(colId => fetchCards(colId)))
    } catch (err) {
      // Roll back any optimistic drag to what the server actually has.
      await Promise.all(
        [sourceColumnId, targetColumnId]
          .filter((id, i, arr) => id !== null && arr.indexOf(id) === i && cards.value[id] !== undefined)
          .map(colId => fetchCards(colId))
      )
      throw err
    }
  }

  function clearBoard() {
    currentBoard.value = null
    columns.value = []
    cards.value = {}
  }

  return {
    boards, currentBoard, columns, cards, loading,
    fetchBoards, createBoard, deleteBoard,
    fetchColumns, addColumn, renameColumn, deleteColumn, reorderColumn,
    fetchCards, fetchAllCards, addCard, updateCard, deleteCard, moveCard,
    clearBoard
  }
})
