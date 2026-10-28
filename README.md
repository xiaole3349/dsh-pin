# dsh-pin

DSH 插件：「钉」与「图书馆」。

把「记忆怎么存、怎么忘」里最硬的一层单独拎出来：

- **钉（pin）**：大部分记忆按时间淡忘，只有极少数真正值得的由本人显式钉住，每轮注入。
- **图书馆（library）**：看完就用的东西（工具、插件、资料）用完就删，只留一句「它能解决什么」，要用时按关键词查。
- **只有私聊能改本体**：群会话里对钉、图书馆以及人格/配置文件的写操作一律拒绝（`tools.guard`）。

## 安装

```sh
# 在 DSH 里
plugin_manager install_bundle <本目录>
```

或放进 profile 的 `cordis.patch.yml`：

```yaml
- insert:
    - id: pin
      name: dsh-pin
```

## 提供什么

- 设置页 `钉`（两个页签：钉 / 图书馆）
- 五个工具：`pin_add`、`pin_list`、`pin_remove`、`library_add`、`library_search`
- HTTP 接口：`/dsh-pin/{list,add,update,delete,candidates,lib/list,lib/add,lib/delete}`
- 每轮把钉住的事注入提示词（没有就不注入，不占字数）

## 数据

- `~/.dsh/jingjing/state/pins.json`
- `~/.dsh/jingjing/state/library.json`

纯文本，能手改、能备份。

## 许可

MIT
