<template>
  <div id="app">
    <input type="file" @change="handleFileChange">
    <button  @click="handleUpload">上传</button>
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
  data () {
    return {
      container: {
        file: null
      },
      data: []
    }
  },
  methods: {
    // 封装请求方法
    request ({url, method = 'post',data, headers={}, requestList}) {
      return new Promise((resolve) => {
        let xhr = new XMLHttpRequest()
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
    // 选择文件
    handleFileChange (e) {
      let [file] = e.target.files
      if(!file) return
      this.container.file = file
    },
    // 操作上传
    async handleUpload () {
      if(!this.container.file) return
      let fileChunkList = this.createFileChunk(this.container.file)
      console.log(fileChunkList)
      this.data = fileChunkList.map(({ file }, index) => {
        return {
          chunk: file,
          hash: `${this.container.file.name}-${index}`
        }
      })
      await this.uploadChunks()
    },
    // 生成切片 返回切片列表
    createFileChunk(file, size = SIZE){
      let fileChunkList = []
      let cur = 0
      while(cur < file.size){
        fileChunkList.push({file: file.slice(cur, cur + size)})
        cur += size
      }
      return fileChunkList
    },
    // 上传切片
    async uploadChunks(){
      let requestList = this.data.map(({ chunk, hash }) => {
        let formData = new FormData()
        formData.append('chunk', chunk)
        formData.append('hash', hash)
        formData.append('filename', this.container.file.name)
        // formData.append("fileHash", this.container.hash)
        return { formData }
      }).map(async ({ formData }) => {
        return this.request({url: api.chunk, data: formData})
      })
      await Promise.all(requestList)
      // 上传完所有切片,通知后端合并
      await this.mergeRequest()
    },
    // 合并请求 通知服务端合并切片
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
        alert("上传成功");
      }
    },
  }
}
</script>
<style lang="scss">

</style>
