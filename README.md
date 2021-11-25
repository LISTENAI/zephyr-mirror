zephyr-mirror
==========

[Zephyr Project](https://github.com/zephyrproject-rtos/zephyr) 国内镜像。每天 0 点 (GMT+8) 同步。

## 用法

### 1. 全新初始化

```sh
git clone https://cloud.listenai.com/zephyr-mirror/manifest ~/zephyrproject/manifest
west init -l ~/zephyrproject/manifest
cd ~/zephyrproject
west update
```

### 2. 作为现有项目的镜像

修改 `west.yml`：

```diff
  remotes:
    - name: upstream
-     url-base: https://github.com/zephyrproject-rtos
+     url-base: https://cloud.listenai.com/zephyr-mirror
```
