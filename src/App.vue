<template>
  <div id="app">
    <input type="file" @change="handleFileChange">
    <el-button type="primary" @click="handleUpload">上传</el-button>
    <div>
      <div>总进度</div>
      <el-progress :percentage="uploadPercentage"></el-progress>
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
            color="#909399"
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
export default {
  filters: {
    transformByte(val) {
      return Number((val / 1024).toFixed(0));
    }
  },
  data () {
    return {
      container: {
        file: null
      },
      data: []
    }
  },
  computed: {
    uploadPercentage(){
      if (!this.container.file || !this.data.length) return 0
      let loaded = this.data.map(item => {
        return item.size * item.percentage
      }).reduce((a, b) => {
        return a + b
      })
      let total = this.container.file.size
      return parseInt(loaded / total)
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
          resolve({data: e.target.response})
        }
      })
    },
    // 一.选择文件
    handleFileChange (e) {
      let [file] = e.target.files
      if(!file) return
      this.data = [] // 选择文件清空data 来清空进度条
      this.container.file = file
    },
    // 二. 点击上传
    async handleUpload () {
      if(!this.container.file) return
      let fileChunkList = this.createFileChunk(this.container.file)
      this.data = fileChunkList.map(({ file }, index) => {
        return {
          index: index,
          percentage:0,
          size: file.size,
          chunk: file,
          hash: `${this.container.file.name}-${index}`
        }
      })
      await this.uploadChunks()
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
    async uploadChunks(){
      let requestList = this.data.map(({ chunk, hash, index }) => {
        let formData = new FormData()
        formData.append('chunk', chunk)
        formData.append('hash', hash)
        formData.append('filename', this.container.file.name)
        // formData.append("fileHash", this.container.hash)
        return { formData, index }
      }).map(async ({ formData, index }) => {
        return this.request({
          url: api.chunk,
          data: formData,
          onProgress: this.createProgressHandler(this.data[index])
        })
      })
      await Promise.all(requestList)
      // 上传完所有切片,通知后端合并
      await this.mergeRequest()
    },
    // 五.合并请求 通知服务端合并切片
    async mergeRequest () {
      let obj = {
        size: SIZE,
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
      }
    },
    // 六. 每个切片的上传进度
    createProgressHandler (item) {
      return e => {
        item.percentage = parseInt((e.loaded / e.total) * 100)
      }
    }
  }
}
</script>
<style lang="scss">

</style>
