# 字里 · 安装指南（写给 AI 助手）

> 这份文件是写给 AI 助手（Claude Code、Codex、Gemini CLI、Hermes 等）看的。你的主人想安装“字里”浏览器插件，请按下面的步骤带他装好。
> 请遵守下面的“带人规则”，用最清楚、最省事的方式带主人装好。

## 带人规则

1. **一次只讲一步**。每一步讲清楚：要点哪里、会看到什么。等主人说“好了”再讲下一步。
2. **说大白话**。不说 manifest、unpacked、native messaging 这类词。非说不可的，先解释它是干什么的。
3. **能替他做的就替他做**：下载文件、解压、运行命令。**必须他自己动手的，就手把手教**：在 Chrome 里点按钮、去官网注册、复制 API Key。
4. **不要碰主人的 API Key**。不要让他把 Key 发给你，也不要替他填进任何地方。教他自己复制、粘贴进字里的设置。Key 相当于花钱的凭证，泄露了别人就能用他的额度。
5. **先问再做**：要装软件、改系统设置、或者要运行第 6 步的本地收纳安装时，先告诉主人要做什么，得到同意再做。
6. 装完以后，**带主人试一次**（见第 4 步），确认真的能用了，再结束。

## 第 0 步：先确认环境

问主人，或者自己检查：

- **浏览器**：需要 Google Chrome。Edge、Brave、Arc、豆包浏览器这类同内核的浏览器一般也能装，但作者只在 Chrome 上验证过。没有 Chrome 的话，让他先去 https://www.google.com/chrome/ 下载安装。
- **系统**：macOS、Windows 都行。只有第 6 步“本地收纳”要求 macOS，而且是可选的。

## 第 1 步：下载字里（你来做）

1. 问主人想放在哪里。默认放在“文稿”里：
   - macOS：`~/Documents/zili`
   - Windows：`%USERPROFILE%\Documents\zili`
2. 下载。电脑上有 git 的话：
   ```bash
   git clone https://github.com/JasonHualun/zili.git ~/Documents/zili
   ```
   没有 git，就下载压缩包解压：
   ```bash
   curl -L -o /tmp/zili.zip https://github.com/JasonHualun/zili/archive/refs/heads/main.zip
   unzip -q /tmp/zili.zip -d /tmp/zili-unzip && mv /tmp/zili-unzip/zili-main ~/Documents/zili
   ```
   Windows（PowerShell）：
   ```powershell
   Invoke-WebRequest https://github.com/JasonHualun/zili/archive/refs/heads/main.zip -OutFile $env:TEMP\zili.zip
   Expand-Archive $env:TEMP\zili.zip -DestinationPath $env:TEMP\zili-unzip
   Move-Item $env:TEMP\zili-unzip\zili-main $env:USERPROFILE\Documents\zili
   ```
3. 检查 `zili/huashao-tone/manifest.json` 存在，就说明下载对了。
4. 记下**插件文件夹的完整路径**，下一步要告诉主人。插件文件夹是 `zili/huashao-tone`，不是外层的 `zili`。

告诉主人：这个文件夹装好以后**不能删、不能挪**，Chrome 每次都从这里读插件。

## 第 2 步：把插件装进 Chrome（主人来做，你来教）

Chrome 不允许程序替人装插件，所以这一步只能主人自己点。按这个顺序教他：

1. 打开 Chrome，在最上面的地址栏输入 `chrome://extensions`，回车。
2. 页面右上角有个“开发者模式”开关，把它打开。
3. 左上角会多出一排按钮，点“**加载已解压的扩展程序**”。
4. 在弹出的选择窗口里，找到第 1 步那个 `huashao-tone` 文件夹，选中它，点“选择”。
   - macOS 小技巧：在选择窗口里按 `⌘ + Shift + G`，粘贴完整路径，回车。
5. 列表里出现“字里”，就装好了。
6. 点浏览器右上角的拼图图标 🧩，找到“字里”，点旁边的图钉，把它固定到工具栏。

常见问题：
- 提示“清单文件缺失或不可读取”：选错了文件夹，要选里面那层 `huashao-tone`。
- 列表里字里显示红色“错误”：让主人点“错误”，把内容念给你听或者截图给你。

## 第 3 步：配一个 API Key（主人来做，你来教）

字里本身免费，但它要调用 AI 大模型写东西，需要主人自己去模型服务商那里拿一个 **API Key**（可以理解成“用这家 AI 的钥匙”，按用量付费，一般几块钱能用很久）。

### 3.1 帮主人选一家

下面这些服务商**选任意一家都行**，润色、回复、翻译、讲解都能用。区别在于能不能看图、能不能联网：

- **可识图**：能用“框选识别”“⌘V 粘贴截图”和对话里发图片。
- **可联网**：能用“核验真假”，也能回答“今天、最新、价格”这类时效问题。

| 服务商 | 去哪拿 Key | 字里里可选的模型 | 能看图 | 能联网 |
|---|---|---|---|---|
| **DeepSeek**（默认，推荐） | https://platform.deepseek.com/api_keys | V4.1 Flash（推荐，便宜快）、V4 Pro（更强） | Flash 能 | 能 |
| **通义千问**（阿里云百炼，推荐） | https://bailian.console.aliyun.com （“API Key”页面，地域选北京） | 3.8 Flash（推荐）、3.7 Flash 省钱、3.7 Plus、3.8 Max、3.7 Max 视觉版 | 除 3.8 Max 外都能 | 能 |
| **豆包**（火山方舟） | https://console.volcengine.com/ark （“API Key 管理”；还要在“开通管理”里开通要用的模型） | Seed 2.1 Turbo（推荐）、Seed 2.1 Pro、Seed Evolving | 能 | 不能 |
| **小米 MiMo** | https://platform.xiaomimimo.com | MiMo V2.5 Pro（推荐）、MiMo V2.5 | V2.5 能 | 不能 |
| **智谱 GLM** | https://open.bigmodel.cn/usercenter/apikeys | GLM 5.2（推荐）、GLM 4.7、GLM 4.7 FlashX | 不能 | 不能 |
| **MiniMax** | https://platform.minimaxi.com （账户管理 → 接口密钥） | M2.7（推荐）、M2.7 Highspeed、M2.5 | 不能 | 不能 |
| **自定义中转站** | 主人自己的中转服务 | 任何兼容 OpenAI 格式的模型 | 自己勾选 | 自己勾选 |

怎么推荐：
- 主人想要功能最全，又不想折腾：推荐 **DeepSeek**（选 V4.1 Flash）或者 **通义千问**（选 3.8 Flash）。这两家既能看图又能联网，所有功能都能用。
- 主人已经有某家的账号：就用那家，告诉他哪些功能用不了（看上表）。
- 各家官网的页面位置可能会变。找不到的话，让主人在官网找“API Key”或“密钥”字样，或者截图给你看。
- 新账号一般要先实名认证、充一点钱（几元到几十元），Key 才能用。

### 3.2 拿 Key 的步骤（教主人）

1. 打开上表对应的网址，注册或登录。
2. 找到“API Key / 密钥”页面，点“创建”，复制那一长串字符（一般以 `sk-` 开头）。
3. **提醒主人**：这串字符只给字里用，不要发给任何人，也不要发给你。

### 3.3 填进字里（教主人）

1. 点工具栏上的字里图标，打开小窗。
2. 点右上角的**齿轮**，打开设置；再点“**模型**”这一行展开。
3. 在“服务商”里选刚才那一家，在“模型”里选推荐的那个。
4. 把 API Key 粘贴进输入框，点“**保存**”。
5. 点“**检查 API**”。显示连接成功，就配好了。

失败的常见原因：Key 复制少了几个字符、账户没充值、豆包没有开通对应模型、选错了服务商。

## 第 4 步：带主人试一次（必须做）

1. 打开任意网页（已经开着的网页先刷新一下）。
2. **试写作**：在任何输入框（比如搜索框、评论框）打一句话，旁边会出现“润色”，点它，看到改写结果后点写入。
3. **试划词**：用鼠标选中网页上的一段文字，弹出小工具条后点“翻译·学英语”或“讲解”。
4. **试小猫**：网页右下角有一只暹罗猫，点它就能直接对话。比如说“这页讲了什么”。

都能用，就装好了。可以把 README 里的“功能一览”简单讲给主人听：https://github.com/JasonHualun/zili#功能一览

## 第 5 步（可选）：英语口语陪练

只有主人想**语音对话练英语口语**才需要这一步。口语陪练目前只接了通义千问的语音模型，和第 3 步选的文字模型**是分开的**：第 3 步选哪家都不受影响，这里单独再配一个通义千问。

教主人：

1. 登录阿里云百炼控制台 https://bailian.console.aliyun.com ，地域选**北京**。
2. 复制**业务空间 ID**：在控制台右上角的“业务空间”里，形如 `ws-xxxxxxxxxxxx`。它不是密钥。
3. 在“API Key”页面复制一个 **API Key**。
4. 点开字里小窗首页的“**英语陪练**”，在弹出的陪练窗口里点开始。第一次会出现“语音陪练设置”：填上业务空间 ID，API Key 填进“语音专用 API Key”，确认。
   - 如果第 3 步的文字模型选的就是通义千问，“语音专用 API Key”可以不填，会沿用那个 Key。
5. 允许麦克风权限，戴上耳机，说一句“开始吧”。

## 第 6 步（可选，仅 macOS）：本地收纳

只有主人想“把网页一键交给电脑上的 AI 助手，整理成笔记”才需要这一步。**这一步要先征得主人同意。**

前提：
- macOS；
- 第 2 步已经把插件装进 Chrome（安装程序要靠它找到插件）；
- 电脑上至少装了一个这些 AI 助手：Claude Code、Codex、Gemini CLI、Qwen Code、OpenCode、Hermes。你自己大概就是其中一个。

1. **先扫描**（只看，什么都不改）：
   ```bash
   cd ~/Documents/zili
   python3 zili-bridge/install.py --scan
   ```
   它会列出这台电脑上找到的 AI 助手，以及哪些浏览器已经装了字里。
2. **把扫描结果讲给主人听，问他两件事**：
   - 允许字里调用哪几个助手？全部允许，还是只选其中几个？
   - 整理好的笔记存到哪个文件夹？默认是 `~/Documents/字里收纳`。
3. **按主人的回答安装**：
   - 全部允许、用默认文件夹：
     ```bash
     python3 zili-bridge/install.py --allow all
     ```
   - 只允许其中几个，或者换文件夹（助手代号：`claude`、`codex`、`gemini`、`qwen`、`opencode`、`hermes`，多个用逗号隔开）：
     ```bash
     python3 zili-bridge/install.py --allow claude,codex --folder ~/Documents/字里收纳
     ```

主人有自己的收纳 Skill 的话，再加上 `--skill Skill名字`；先读一下这个 Skill，它要存到收纳文件夹以外的目录（比如 Obsidian 库）时，再加 `--skill-dir 目录路径`（多个用英文逗号隔开），否则 Codex、Claude Code 没有权限写进去。不加就用字里自带的整理规则：按主题分文件夹，每条写标题、原链接、要点摘要和正文。

装完后教主人：
1. 在 `chrome://extensions` 里点字里的刷新按钮，再刷新网页。
2. 打开字里设置，在“本地收纳”里选要用的助手。
3. 在网页上点小猫 → 切到“收纳” → 点“保存”，等几十秒，看“最近收纳”里的回执。

说明：
- AI 助手只会在收纳文件夹里读写文件。网页内容只被当作资料，里面要求做的事一律不执行。
- 以后要换助手或换文件夹，按主人的新要求重新运行一次第 3 小步的命令。卸载用 `python3 zili-bridge/install.py --uninstall`，收纳文件夹里的内容不会动。

## 以后怎么更新

```bash
cd ~/Documents/zili && git pull
```

当初是下载压缩包装的，就重新下载一次，覆盖 `huashao-tone` 文件夹里的内容（文件夹位置不要变）。然后教主人在 `chrome://extensions` 里点字里的刷新按钮，再刷新网页。设置和 API Key 都会保留。

## 隐私（可以讲给主人听）

- API Key、口吻档案、英语收藏、聊天记录都只存在主人自己的浏览器里。字里没有服务器，不收集任何数据。
- 只有主人主动使用某个功能时，相关文字或截图才会直接发给他选的那家模型服务商。
