# big-file 大文件上传

参考[请你实现一个大文件上传和断点续传](https://juejin.im/post/6844904046436843527#heading-6)

从零搭建前端和服务端，实现一个大文件上传和断点续传的 demo

前端：vue 

服务端：nodejs

## 起步
```
#安装依赖
yarn
# 启动服务
yarn serve
# 启动前端
yarn start
```

### 思路

利用`Blob.prototype.slice` 方法将文件分成`n`个切片, 每个切片发送个上传请求, 

等所有请求完成, 再发送个合并请求, 通知服务端合并之前上传的切片

服务端接收这些切片,先缓存到一个文件夹中, 待接到合并请求后,

使用 nodejs 的 读写流（readStream/writeStream），将所有切片的流传输到最终文件的流里

合并完后删除缓存文件夹

## 版本

### 一. 初步完成文件切片上传

使用slice()将文件切片后使用Promise.all()分切片上传, 

服务端接收 使用multiparty 解析传过来的文件, 切片上传完后, 发送切片合并请求, 服务端合并切片, 完成这个流程

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
#   b i g f i l e - u p l o a d 
 
 