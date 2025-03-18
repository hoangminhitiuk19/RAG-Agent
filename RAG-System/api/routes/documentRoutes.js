const express = require('express');
const router = express.Router();
const { addDocuments, queryRAG } = require('../services/ragService');
const { addDocumentsToQdrant, queryQdrantRAG } = require('../services/qdrantRagService');

/**
 * @route POST /api/documents/add
 * @desc Add documents to the original RAG system
 */
router.post('/add', async (req, res, next) => {
  try {
    const { documents } = req.body;
    
    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({ error: 'Documents array is required' });
    }

    const result = await addDocuments(documents);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/documents/qdrant/add
 * @desc Add documents to the Qdrant RAG system
 */
router.post('/qdrant/add', async (req, res, next) => {
  try {
    const { documents } = req.body;
    
    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({ error: 'Documents array is required' });
    }

    const result = await addDocumentsToQdrant(documents);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/documents/query
 * @desc Query the original document database directly
 */
router.post('/query', async (req, res, next) => {
  try {
    const { query, context } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const result = await queryRAG(query, context || {});
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/documents/qdrant/query
 * @desc Query the Qdrant document database directly
 */
router.post('/qdrant/query', async (req, res, next) => {
  try {
    const { query, context } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const result = await queryQdrantRAG(query, context || {});
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;