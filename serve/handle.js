const path = require('path')
const fse = require('fs-extra')
const multiparty = require('multiparty')  // 需安装依赖  https://www.npmjs.com/package/multiparty
// path.resolve([...paths]) 方法会将路径或路径片段的序列解析为绝对路径 如果没有传入 path 片段，则 path.resolve() 会返回当前工作目录的绝对路径
const UPLOAD_DIR = path.resolve(__dirname, '..', 'target') // 设置文件存储目录
// 处理文件类
class DP {
  /**
   * 处理切片
   **/ 
  async chunk (req, res) {
    const multipart = new multiparty.Form()
    multipart.parse(req, async (err, fields, files) => {
      if(err) return
      console.log('------------------接收切片------------------')
      const [ chunk ] = files.chunk
      const [ hash ] = fields.hash
      const [ filename ] = fields.filename
      // 7.6 文件存在直接返回
      let [ fileHash ] = fields.fileHash
      let ext = extractExt(filename) 
      let filePath = path.resolve(UPLOAD_DIR, `${fileHash}${ext}`)
      const chunkDir = path.resolve(UPLOAD_DIR, fileHash) // 7.5 文件夹名字 变为hash
      if(fse.existsSync(filePath)){
        res.end(JSON.stringify({
          status: 200,
          msg: '文件已存在'
        }))
        return
      }
      // 切片目录不存在, 创建切片目录
      if(!fse.existsSync(chunkDir)){ // fs.existsSync(path) 如果路径存在，则返回 true，否则返回 false。
        await fse.mkdirs(chunkDir)   // 同步地创建目录
      }
      // fs-extra 专用方法, 类似fs.rename 并且跨平台 fs-extra 的rename 方法 windows 平台会有权限问题
      // https://github.com/meteor/meteor/issues/7852#issuecomment-255767835
      console.log('------------------缓存切片------------------')
      await fse.move(chunk.path, `${chunkDir}/${hash}`)
      res.end(JSON.stringify({
        status: 200,
        msg: '接收文件切片成功'
      }))
    })
  }
  /**
   * 合并
   */
  async merge (req, res) {
    let data = await resolvePost(req)
    let {fileHash, filename, size} = data
    let ext = extractExt(filename)  // 7.5使用hash名
    let filePath = path.resolve(UPLOAD_DIR, `${fileHash}${ext}`) // 指定合并后的文件路径
    await mergeFileChunk(filePath, fileHash, size) // 7.6改为hash
    res.end(JSON.stringify({
      status: 200,
      msg: '文件合并成功',
      filePath
    }))
  }
  /**
   * 验证是否已上传/已上传切片下标从 8.2
   */
  async verify (req, res) {
    let data = await resolvePost(req)
    let { filename, fileHash} = data
    let ext = extractExt(filename)
    let filePath = path.resolve(UPLOAD_DIR, `${fileHash}${ext}`)
    if(fse.existsSync(filePath)){
      res.end(JSON.stringify({
        shouldUpload: false,
        msg: '文件已存在, 无需再上传'
      }))
    } else {
      res.end(JSON.stringify({
        shouldUpload: true,
        msg: '文件不存在, 请继续上传',
        uploadedList: await createUploadedList(fileHash)
      }))
    }
  }
}


/**
 * 合并切片工具函数
 * 
*/
// 解析请求体
function resolvePost (req) {
  return new Promise( resolve => {
    let chunk = ''
    req.on('data', data => {
      chunk += data
    })
    req.on('end', () => {
      resolve(JSON.parse(chunk))
    })
  })
}
function pipeStream (path, writeStream){
  return new Promise(resolve => {
    let readStream = fse.createReadStream(path)
    // 读取完后删除切片
    readStream.on('end', () => {
      fse.unlinkSync(path) // 同步删除文件或符号链接
      resolve()
    })
    // 注意顺序
    readStream.pipe(writeStream)
  })
}
// 合并文件
async function mergeFileChunk(filePath, fileHash, size){
  // 根据文件名获取 切片文件夹 (没有后缀)
  let chunkDir = path.resolve(UPLOAD_DIR, fileHash)
  // 根据切片路径 获取文件夹下的所有切片  http://nodejs.cn/api/fs.html#fs_fs_readdir_path_options_callback
  //fs.readdir(path[, options], callback) 读取目录的内容。 回调有两个参数 (err, files)，其中 files 是目录中文件的名称的数组（不包括 '.' 和 '..'）
  let chunkPaths = await fse.readdir(chunkDir)  
  // 拿到切片后,可能顺序是乱的, 所以排个序 切片名: 文件名.后缀-index
  chunkPaths.sort((a, b) => a.split('-')[1] - b.split('-')[1])
  let list = chunkPaths.map((chunkPath, index) => {
    let url = path.resolve(chunkDir, chunkPath)
    // 指定位置创建可写流 fs.createWriteStream(path[, options])  http://nodejs.cn/api/fs.html#fs_fs_createwritestream_path_options
    let writeStream = fse.createWriteStream(filePath, {
      start: index * size,
      end: (index + 1) * size
    })
    return pipeStream(url, writeStream)
  })
  await Promise.all(list)
  // 合并完成后删除切片缓存文件夹
  fse.rmdirSync(chunkDir)
}
// 提取后缀名
function extractExt (filename) {
  return filename.slice(filename.lastIndexOf("."), filename.length); 
}
// 8.3返回已经上传的切片名 如果存在该文件夹, 就返回文件夹内的切片列表, 否则空
async function createUploadedList(fileHash){
  let filePath = path.resolve(UPLOAD_DIR, fileHash)
  return fse.existsSync(filePath) ? await fse.readdir(filePath) : []
}
module.exports = DP