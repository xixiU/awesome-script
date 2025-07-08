本地终端测试：
```bash
curl -X POST \
  --data-binary "@aicourt-monitor-service-1.0.jar" \
  "http://172.31.160.184:5678/webhook-test/uploadJar?fileName=aicourt-monitor-service-1.0.jar"
```