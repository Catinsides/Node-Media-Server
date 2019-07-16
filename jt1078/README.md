## JT 1078 协议解析

### 启动方式

配置参考 **app.js** 中 **s1078** 部分
在 **Dokcerfile** 所在目录执行以下命令

```
docker build -t mynms .
docker run -it -p 1935:1935 -p 8000:8000 -p 8443:8443 -v $PWD/media/:/usr/src/nodemediaserver/media -d mynms
```
