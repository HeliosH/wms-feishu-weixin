const express = require('express')
const router = express.Router()
const { feishuClient } = require('../config')

router.get('/token', async (req, res) => {
  try {
    const token = await feishuClient.getToken()
    res.json({ code: 0, data: { token } })
  } catch (err) {
    res.json({ code: -1, message: err.message })
  }
})

module.exports = router
