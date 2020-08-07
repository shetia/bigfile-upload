<template>
  <div class="big-file">
    <div class="handle-box">
      <input class="file-select" type="file" @change="handleFileChange">
      <el-button type="primary" @click="handleUpload" :disabled="uploadDisabled">上传</el-button>
      <el-button type="warning" @click="handleResume"  v-if="status === STATUS.pause">继续</el-button>
      <!-- 状态不是上传中或没有文件 禁用暂停 -->
      <el-button type="danger" @click="handlePause"  v-else :disabled="status !== STATUS.uploading || !container.hash">暂停</el-button>
    </div>
    <div class="upload-progress">
      <!-- 7.6 -->
      <div>
        <h3>计算文件hash</h3>
        <el-progress type="circle" :stroke-width="12" :percentage="hashPercentage" :color="colors"></el-progress>
      </div>
      <div>
        <h3>总进度</h3>
        <el-progress type="circle" :stroke-width="12"  :percentage="fakeUploadPercentage" :color="colors"></el-progress>
      </div>
    </div>
    <!-- 切片进度条 -->
    <el-table :data="data">
      <el-table-column
        prop="hash"
        label="切片hash"
        align="center"
      ></el-table-column>
      <el-table-column label="大小(KB)" align="center" width="120">
        <template v-slot="{ row }">
          {{ row.size | transformByte }}
        </template>
      </el-table-column>
      <el-table-column label="进度" align="center">
        <template v-slot="{ row }">
          <el-progress
            :percentage="row.percentage"
          ></el-progress>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>
<script>
const SIZE = 10 * 1024 * 1024 // 切片大小
const BASEURL = '/api'
let api = {
  chunk: '/chunk',
  verify: '/verify',
  merge: '/merge',
}
for(let prop in api){
  api[prop] = BASEURL + api[prop]
}
const STATUS = {
  wait: "wait",  // 等待
  pause: "pause", // 暂停
  uploading: "uploading" // 上传中
};
export default {
  filters: {
    transformByte(val) {
      return Number((val / 1024).toFixed(0));
    }
  },
  data () {
    return {
      STATUS,
      status: STATUS.wait,
      container: {
        file: null,
        worker: {},  // 7.4
        hash: ''     // 7.5
      },
      data: [],
      hashPercentage: 0, //7.3 hash进度
      isPaused: true,
      requestList: [],
      fakeUploadPercentage: 0, // 10. 2 假进度条
      colors: [
        {color: '#f56c6c', percentage: 20},
        {color: '#e6a23c', percentage: 40},
        {color: '#5cb87a', percentage: 60},
        {color: '#1989fa', percentage: 80},
        {color: '#6f7ad3', percentage: 100}
      ]
    }
  },
  computed: {
    uploadPercentage(){ // 总进度条
      if (!this.container.file || !this.data.length) return 0
      let loaded = this.data.map(item => {
        return item.size * item.percentage
      }).reduce((a, b) => {
        return a + b
      })
      let total = this.container.file.size
      return parseInt(loaded / total)
    },
    uploadDisabled () { // 10.4 禁用上传按钮
      // 当没选择文件 或者 暂停/上传中 时 禁用
      return (!this.container.file || [STATUS.pause, STATUS.uploading].includes(this.status)) 
    }
  },
  watch: {
    uploadPercentage(n){  // 10.3 监听总进度条 当暂停时会取消 xhr 导致进度条后退
      if(n > this.fakeUploadPercentage){
        this.fakeUploadPercentage = n
      }
    }
  },
  methods: {
    // 封装请求方法
    request ({url, method = 'post',data, headers={}, onProgress = e => e, requestList}) {
      return new Promise((resolve) => {
        let xhr = new XMLHttpRequest()
        xhr.upload.onprogress = onProgress
        xhr.open(method, url)
        // 设置请求头
        for(let key in headers) {
          xhr.setRequestHeader(key, headers[key])
        }
        xhr.send(data)
        xhr.onload = e => {
          // 9.1将请求成功的xhr从请求列表删除
          if(requestList && requestList.length){
            let index = requestList.findIndex(t => t === xhr)
            requestList.splice(index, 1)
          }
          resolve({data: e.target.response})
        }
        // 9.2将当前的xhr暴露给外部, 也就是this.requestList
        requestList?.push(xhr)
      })
    },
    // 一.选择文件
    handleFileChange (e) {
      let [file] = e.target.files
      if(!file) return
      this.resetData() // 11.2 重新选择文件, 取消请求, 重置数据
      this.data = [] // 选择文件清空data 来清空进度条
      this.hashPercentage = 0
      this.fakeUploadPercentage = 0
      this.status = STATUS.wait
      this.container.file = file
    },
    // 二. 点击上传
    async handleUpload () {
      this.hashPercentage = 0  // 清空计算hash进度
      if(!this.container.file) return
      this.status = STATUS.uploading // 11.3 点击上传把状态转变
      let fileChunkList = this.createFileChunk(this.container.file)
      // 7.1生成hash
      this.container.hash = await this.calculateHash(fileChunkList)
      // 8.1 验证文件是否已经上传, 上传过了就不上传了,直接返回上传成功
      let { shouldUpload, uploadedList } = await this.verifyUpload(this.container.file.name, this.container.hash)
      if(!shouldUpload){
        this.$message.success('秒传:上传成功')
        this.status = STATUS.wait  // 11.3 改变状态
        return
      }
      // 不存在 继续上传切片
      this.data = fileChunkList.map(({ file }, index) => {
        let chunkHash = `${this.container.hash}-${index}`
        return {
          fileHash:this.container.hash, // 7.2
          index: index,
          percentage: uploadedList.includes(chunkHash) ? 100 : 0, // 10.1 上传过的 进度条变100%
          size: file.size,
          chunk: file,
          hash: chunkHash // 7.3 将原来用文件名的变成使用hash
        }
      })
      await this.uploadChunks(uploadedList) // 9.3
    },
    // 三. 生成切片 返回切片列表
    createFileChunk(file, size = SIZE){
      let fileChunkList = []
      let cur = 0
      while(cur < file.size){
        fileChunkList.push({file: file.slice(cur, cur + size)})
        cur += size
      }
      return fileChunkList
    },
    // 四.上传所有切片
    async uploadChunks(uploadedList = []){ // 9.4
      let requestList = this.data
      .filter(({ hash }) => !uploadedList.includes(hash)) // 9.5过滤已经上传了的
      .map(({ chunk, hash, index }) => {
        let formData = new FormData()
        formData.append('chunk', chunk)
        formData.append('hash', hash)
        formData.append('filename', this.container.file.name)
        formData.append("fileHash", this.container.hash) // 7.4 设置hash
        return { formData, index }
      }).map(async ({ formData, index }) => {
        return this.request({
          url: api.chunk,
          data: formData,
          onProgress: this.createProgressHandler(this.data[index]),
          requestList: this.requestList  // 9.3 按值传参 requestList变化影响this.requestList
        })
      })
      await Promise.all(requestList)
      // 上传完所有切片,通知后端合并 9.6 之前上传的切片数量 + 本次上传的切片数量 = 所有切片数量时
      if(uploadedList.length + requestList.length === this.data.length){
        await this.mergeRequest()
      }
    },
    // 五.合并请求 通知服务端合并切片
    async mergeRequest () {
      let obj = {
        size: SIZE,
        fileHash: this.container.hash,
        filename: this.container.file.name
      }
      let res = await this.request({
        url: api.merge,
        headers: {
          'content-type': 'application/json',
        },
        data: JSON.stringify(obj)
      })
      let resData = JSON.parse(res.data)
      if(resData.status == 200){
        this.$message.success('上传成功')
        this.status = STATUS.wait  // 11.3 改变状态
      }
    },
    // 六. 每个切片的上传进度  用闭包保存每个 chunk 的进度数据
    createProgressHandler (item) {
      return e => {
        item.percentage = parseInt((e.loaded / e.total) * 100)
      }
    },
    // 七. 生成文件 hash (web-worker)
    calculateHash(fileChunkList){
      return new Promise(resolve => {
        // 添加worker属性
        this.container.worker = new Worker('/hash.js')
        this.container.worker.postMessage({ fileChunkList })
        this.container.worker.onmessage = e => {
          let { percentage, hash } = e.data
          this.hashPercentage = percentage
          if(hash){
            resolve(hash)
          }
        }
      })
    },
    // 八. 根据 hash 验证文件是否曾经已经被上传过 没有才进行上传
    async verifyUpload(filename, fileHash){
      let { data } = await this.request({
        url: api.verify,
        headers: {
          "content-type": "application/json"
        },
        data: JSON.stringify({
          filename,
          fileHash
        })
      })
      return JSON.parse(data)
    },
    // 九. 暂停上传
    handlePause () {
      this.resetData()  // 11.1 取消请求
      this.status = STATUS.pause
    },
    // 十. 继续上传
    async handleResume () {
      this.status = STATUS.uploading
      // 看之前已经上传多少个了
      let { uploadedList } = await this.verifyUpload(this.container.file.name, this.container.hash)
      await this.uploadChunks(uploadedList)
    },
    // 十一. 取消上传 重置数据  
    resetData () {
      this.requestList.forEach(xhr => xhr?.abort()) // 取消请求
      this.requestList = []
      if(this.container.worker){
        this.container.worker.onmessage = null
      }
    }
  }
}
</script>
<style lang="scss">
.big-file{
  width: 1200px;
  margin: 10px auto;
  .handle-box{
    margin-bottom: 24px;;
    .file-select{
      box-shadow: 0px 0px 5px #ccc;
      padding: 12px;
      border-radius: 4px;
      margin-right: 12px;
    }
  }
  .upload-progress{
    display: flex;
    >div{
      text-align: center;
      margin-right: 24px;
    }
  }
}
</style>
