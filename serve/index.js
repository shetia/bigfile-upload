const http = require('http')  // node 内置模块
const server = http.createServer()
const DP = require('./handle')
let dp = new DP() // 创建文件接口实例
server.on('request', async(req, res) => {
  // 设置跨域
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  // 设置返回数据编码格式, 解决返回信息中文乱码问题
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  if(req.method === 'OPTIONS'){
    res.status = 200
    res.end()
    return
  }
  // 接口
  let fnc = {
    '/chunk': 'chunk',  // 切片上传
    '/merge': 'merge',  // 合并切片
  }[req.url]
  let fn = dp[fnc] || async function (req, res){
    res.end('没有这个接口!')
  }
  await fn(req, res)
  return
})


const PORT = 3333
const HOST = 'localhost'
server.listen(PORT, () => {
  console.log(`listening http://%s:%s`, HOST, PORT)
})