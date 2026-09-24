const express = require('express');
const { getDb } = require('../db/init');
const { authMiddleware } = require('../middleware/auth');
const { normalizeDueDate, normalizePriority } = require('../utils/validation');

const router = express.Router();

router.use(authMiddleware);

function parseCardFields(body, { partial = false } = {}) {
  const fields = {};

  if (!partial || body.title !== undefined) {
    const title = (body.title || '').toString().trim();
    if (!title) throw new Error('Card title is required');
    fields.title = title;
  }

  if (!partial || body.description !== undefined) {
    fields.description = body.description || '';
  }

  if (!partial || body.priority !== undefined) {
    fields.priority = normalizePriority(body.priority);
  }

  if (!partial || body.due_date !== undefined) {
    fields.due_date = normalizeDueDate(body.due_date);
  }

  return fields;
}

// Helper: verify card ownership through column -> board -> user
function getCardWithOwnership(db, cardId, userId) {
  return db.prepare(`
    SELECT c.*, col.board_id, b.user_id 
    FROM cards c
    JOIN columns col ON c.column_id = col.id
    JOIN boards b ON col.board_id = b.id
    WHERE c.id = ?
  `).get(cardId);
}

function verifyColumnOwnership(db, columnId, userId) {
  return db.prepare(`
    SELECT col.*, b.user_id 
    FROM columns col 
    JOIN boards b ON col.board_id = b.id 
    WHERE col.id = ?
  `).get(columnId, userId);
}

// GET /api/columns/:columnId/cards - Get cards in column
router.get('/columns/:columnId/cards', (req, res) => {
  const db = getDb();
  try {
    const col = db.prepare(`
      SELECT col.*, b.user_id FROM columns col 
      JOIN boards b ON col.board_id = b.id 
      WHERE col.id = ?
    `).get(req.params.columnId);

    if (!col || col.user_id !== req.user.id) {
      db.close();
      return res.status(404).json({ error: 'Column not found' });
    }

    const cards = db.prepare(`
      SELECT * FROM cards 
      WHERE column_id = ? 
      ORDER BY position ASC
    `).all(req.params.columnId);

    db.close();
    res.json(cards);
  } catch (err) {
    db.close();
    res.status(500).json({ error: 'Failed to fetch cards' });
  }
});

// POST /api/columns/:columnId/cards - Add card
router.post('/columns/:columnId/cards', (req, res) => {
  let fields;
  try {
    fields = parseCardFields(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const db = getDb();
  try {
    const col = db.prepare(`
      SELECT col.*, b.user_id FROM columns col 
      JOIN boards b ON col.board_id = b.id 
      WHERE col.id = ?
    `).get(req.params.columnId);

    if (!col || col.user_id !== req.user.id) {
      db.close();
      return res.status(404).json({ error: 'Column not found' });
    }

    // Get max position in this column
    const maxPos = db.prepare('SELECT MAX(position) AS maxPos FROM cards WHERE column_id = ?').get(req.params.columnId);
    const newPosition = (maxPos.maxPos ?? -1) + 1;

    const result = db.prepare(`
      INSERT INTO cards (column_id, title, description, priority, due_date, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.params.columnId,
      fields.title,
      fields.description,
      fields.priority,
      fields.due_date,
      newPosition
    );

    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(result.lastInsertRowid);
    db.close();
    res.status(201).json(card);
  } catch (err) {
    db.close();
    res.status(500).json({ error: 'Failed to create card' });
  }
});

// PUT /api/cards/:id - Update card
router.put('/cards/:id', (req, res) => {
  const db = getDb();

  try {
    const card = getCardWithOwnership(db, req.params.id, req.user.id);
    if (!card || card.user_id !== req.user.id) {
      db.close();
      return res.status(404).json({ error: 'Card not found' });
    }

    let fields;
    try {
      fields = parseCardFields(req.body, { partial: true });
    } catch (err) {
      db.close();
      return res.status(400).json({ error: err.message });
    }

    const updates = [];
    const params = [];

    if (fields.title !== undefined) { updates.push('title = ?'); params.push(fields.title); }
    if (fields.description !== undefined) { updates.push('description = ?'); params.push(fields.description); }
    if (fields.priority !== undefined) { updates.push('priority = ?'); params.push(fields.priority); }
    if (fields.due_date !== undefined) { updates.push('due_date = ?'); params.push(fields.due_date); }

    updates.push("updated_at = datetime('now')");

    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE cards SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
    db.close();
    res.json(updated);
  } catch (err) {
    db.close();
    res.status(500).json({ error: 'Failed to update card' });
  }
});

// DELETE /api/cards/:id - Delete card
router.delete('/cards/:id', (req, res) => {
  const db = getDb();
  try {
    const card = getCardWithOwnership(db, req.params.id, req.user.id);
    if (!card || card.user_id !== req.user.id) {
      db.close();
      return res.status(404).json({ error: 'Card not found' });
    }

    db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);

    // Reorder remaining cards in the column
    db.prepare(`
      UPDATE cards SET position = position - 1 
      WHERE column_id = ? AND position > ?
    `).run(card.column_id, card.position);

    db.close();
    res.json({ message: 'Card deleted' });
  } catch (err) {
    db.close();
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

// PUT /api/cards/:id/move - Move card to another column
router.put('/cards/:id/move', (req, res) => {
  const { columnId, position } = req.body;
  if (!columnId) {
    return res.status(400).json({ error: 'Target column ID is required' });
  }

  const db = getDb();
  try {
    const card = getCardWithOwnership(db, req.params.id, req.user.id);
    if (!card || card.user_id !== req.user.id) {
      db.close();
      return res.status(404).json({ error: 'Card not found' });
    }

    // Verify target column belongs to same board and user
    const targetCol = db.prepare(`
      SELECT col.*, b.user_id FROM columns col 
      JOIN boards b ON col.board_id = b.id 
      WHERE col.id = ? AND col.board_id = ?
    `).get(columnId, card.board_id);

    if (!targetCol || targetCol.user_id !== req.user.id) {
      db.close();
      return res.status(404).json({ error: 'Target column not found in this board' });
    }

    const oldColumnId = card.column_id;
    const oldPosition = card.position;

    // Get max position in target column
    const maxPos = db.prepare('SELECT MAX(position) AS maxPos FROM cards WHERE column_id = ?').get(columnId);
    const newPosition = position !== undefined ? Math.min(position, (maxPos.maxPos ?? -1) + 1) : (maxPos.maxPos ?? -1) + 1;

    // Build the canonical ordering for both affected columns in memory, then
    // persist it in one pass. Computing the lists up front (before any UPDATE)
    // makes same-column reorders and cross-column moves use the same correct
    // logic instead of shifting positions twice.
    let sourceIds = [];
    if (oldColumnId !== columnId) {
      sourceIds = db.prepare(
        'SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position ASC, id ASC'
      ).all(oldColumnId, req.params.id).map(r => r.id);
    }

    const targetIds = db.prepare(
      'SELECT id FROM cards WHERE column_id = ? ORDER BY position ASC, id ASC'
    ).all(columnId).map(r => r.id).filter(id => id !== Number(req.params.id));

    const insertAt = Math.max(0, Math.min(newPosition, targetIds.length));
    targetIds.splice(insertAt, 0, Number(req.params.id));

    const applyOrder = db.transaction((assignments) => {
      const stmt = db.prepare('UPDATE cards SET column_id = ?, position = ? WHERE id = ?');
      for (const a of assignments) stmt.run(a.columnId, a.position, a.id);
      db.prepare("UPDATE cards SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    });

    const assignments = targetIds.map((id, i) => ({ columnId, position: i, id }));
    if (oldColumnId !== columnId) {
      sourceIds.forEach((id, i) => assignments.push({ columnId: oldColumnId, position: i, id }));
    }
    applyOrder(assignments);

    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
    db.close();
    res.json(updated);
  } catch (err) {
    db.close();
    res.status(500).json({ error: 'Failed to move card' });
  }
});

module.exports = router;
