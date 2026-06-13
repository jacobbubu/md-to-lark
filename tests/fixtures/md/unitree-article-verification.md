> **核心结论：** Unitree 正在沿着 BYD 和 DJI 走过的路线，把最贵也最难做的执行器做到规模化，再把四足机器人时代积累下来的成本、供应链和制造能力迁移到人形机器人上。文章给出的证据是，G1 的成本与毛利、制造垂直整合程度，以及轻量仓储场景中的真实部署数据，都已经逼近甚至跨过“可用”门槛，这意味着一旦放量，全球机器人产业的价格体系与供应链主导权都可能被它重写。

**有趣事实：**
- 据文中消息，Unitree 可能会在未来几周内交付第 10,000 台人形机器人。
- 过去 12-18 个月里，Unitree 把 G1 税前售价从 5 万美元以上压到 2.73 万美元，作者估算其毛利率仍可达到 67%。
- Unitree 入门级四足机器人的价格在 6 年内下跌了 94%-96%，从 2018 年 Laikago 的 4.5 万美元降到如今 Go2 的 1,600-2,800 美元。
- 作者估计，除研究和爱好者销售外，2025 年可能已有多达 250 台 Unitree 人形机器人进入真实产业试点或部署，其中一家公司已部署 30 台 G1。

# 中国的 Unitree 将主导全球机器人产业

### 新一代机器人里最快的迭代周期，可能还会以前所未有的速度继续加速

> 来源: <https://newsletter.semianalysis.com/p/chinas-unitree-will-dominate-global>
> 作者: SemiAnalysis
> 发布日期: 2026-06-09，显示于 Brave（post_date: 2026-06-08T16:35:36.456Z）
> 获取时间: 2026-06-13，来自一个经浏览器认证的 Substack post API 会话。
> 读者范围: only_paid
> Publication ID: 6349492

我们正在见证另一家中国硬件巨头的诞生。三年前，Unitree 还只是一家四足机器人公司。到去年，它已经把四足领域的主导地位延伸到人形机器人市场，并在那里建立领先位置。今年，它的 G1 人形机器人终于开始进入可行部署阶段，另外还有 3 款新设计在路上，其中包括它最直接的[西方人形机器人竞品](https://www.unitree.com/H2)。

Tesla 在 **2022** 年首次展示人形机器人，而当它以及其他西方玩家如今仍在生产处于早期、尚未成熟的人形机器人时，**据我们了解，Unitree 可能会在未来几周内交付第 10,000 台。**

如今，Unitree 在毛利率 60% 的产品线上实现营收同比翻三倍，计划投入近 3 亿美元做 AI 研发，持续把更多制造环节收回内部，同时还把人形机器人价格压到远低于市场其他玩家的水平。随着备受期待的[IPO](https://static.sse.com.cn/stock/disclosure/announcement/c/202603/002178_20260320_QY8F.pdf)临近，Unitree 理所当然地占据了人形机器人讨论的中心。但从历史上看，Unitree 的人形机器人一直有[可靠性不够完美](https://www.youtube.com/shorts/ZKHiooTF0Eg)的名声，也常被认为除了[娱乐](https://www.youtube.com/watch?v=Ykiuz1ZdGBc)和[R&D](https://www.prnewswire.com/news-releases/nvidia-gtc-conferenceunitree-h1-humanoid-robot-embraces-ai-with-the-world-302096830.html)之外并不实用，还背着“便宜货”的口碑。

尽管如此，我们认为 Unitree 的**成本结构**恰恰是它相对竞争对手最大的优势之一。过去 12-18 个月里，Unitree 已把税前售价**从 5 万美元以上砍到 2.73 万美元。**即便在这个价位，我们估算它的旗舰 G1 仍能做到**67% 的毛利率。**随着制造规模扩大、BoM（物料清单）快速下降，**我们甚至已经听到某些交易的价格远低于 2 万美元。**

![](assets/image-1.jpg)

_来源：SemiAnalysis 估算_

这些 BoM 是我们通过完整审视 Unitree 机器人的设计、与每一种部件的制造商交流、并与多位供应链买家和卖家交叉验证后得出的。

最后，尽管外界对这家公司有数不清的轻蔑评论，我们认为它的 G1 人形机器人正在越过现实世界部署的可行性门槛。

![](assets/image-2.jpg)

_来源：SemiAnalysis 估算_

然而，几乎没人真正理解 Unitree 的战略、成本与制造能力，也没人真正说清这些机器人的“有用性”争议。今天我们就来把这件事讲明白。我们的研究将展示 Unitree 如何复刻 BYD 和 DJI 的路线：先培育自己的生态，催生新市场，再反过来吞掉这些市场。这一战略此刻正在展开。随着更多新市场即将出现，Unitree 的爆发式增长应会继续。

![](assets/image-3.jpg)

_来源：[Zoomax](https://zoomax.com/the-rise-of-robotic-guide-dogs-and-chinas-technological-leadership/)_

接着我们会审视它的具体硬件战略，以及它为何选择 QDD 执行器设计，这一选择如何带来潜在的结构性优势，以及其执行器又是如何改进到接近可部署等级的。

最后，我们会论证：Unitree 的性能提升与成本优势，如今正在逼近可以替代人工的经济可行区间。今天很可能已经有超过 250 台 Unitree 机器人部署在劳动场景中，我们会详细拆解这套部署账是怎么算出来的。尤其值得注意的是，Unitree 走到今天，靠的还是小型爱好者/研究者市场。如果它能打开真正可行的部署并达到临界规模，增长速度可能会快得惊人。

这一切都建立在一种让西方在成本与交期上全面落败的规模与制造能力之上，而 Unitree 本身在中国竞争生态里也格外突出。在付费墙后，我们会具体讨论那些试图解锁更多任务和市场的新型机器人手厂商，以及谁会被 Unitree 的供应链吃掉，谁又会从中受益。

Unitree 的 IPO，标志着机器人时代真正开始。它正在解锁市场、搭建生态，并推行一种可能通往其他中国硬件巨头路径的规模战略。先回到过去，看看 Unitree 为什么可能真的走成。

# 一家中国硬件巨头是如何炼成的

一个完全成熟的中国硬件巨头，现实里会是什么样？今天的车企 BYD，就是 Unitree 战略成熟形态的绝佳例子：掌握 BoM 里最昂贵、最难做的部件，用这种掌控把别人追不上的成本优势不断复利放大，同时通过把供应链更多环节收回内部，在创造新市场的同时吃下更多价值。

![](assets/image-4.jpg)

_来源：[BYD](https://commons.wikimedia.org/wiki/File:2023_%D0%92YD_Seagull_(front).jpg)_

BYD 最初聚焦的是电芯。电池曾可占到一辆电动车 BoM 的 30%-40%（现在占比更低了，这得感谢 BYD）。BYD 成立于 1994 年，最初生产的是日本老牌厂商因毒性问题退出后留下的电池电芯。它花了将近 10 年打磨产品，直到 2011 年才进入电动车领域，起初也只是一个小众玩家。2011 年 10 月，BYD 把第一款纯电动车 e6 推向[中国市场](https://web.archive.org/web/20111101200501/http://www.bydenergy.com/bydenergy/energy/News%20Center/News/78.html)时，中国全年电动车销量只有 8,159 辆，仅占[新车销量的 0.04%](https://en.wikipedia.org/wiki/Plug-in_electric_vehicles_in_China)。当时根本不存在真正的电动车市场，但 BYD 帮着把这个市场做出来了。

**BYD 的战略是关键。**

**随着汽车销量扩大，掌握电芯会把需求直接传导出去，进而带来供给改善和生态形成，**像 [Hunan Yuneng](https://christopherchico.substack.com/p/why-korean-battery-makers-are-converting) 和 [Shenzhen Dynanonic](https://christopherchico.substack.com/p/why-korean-battery-makers-are-converting)（LFP 正极材料）、[Inovance](https://www.marklines.com/en/top500/inovance-technology)（电机和逆变器）以及 [Sanhua](https://www.sanhuaautomotive.com/en)（热管理）这样的厂商，才得以涌现出来，为 BYD 供应下一代、更好且更便宜的零部件。2010 年时，这些公司都还不存在有意义的规模。

**BYD 可以自由决定哪些制造环节值得内收，从而让优势继续复利。**它把电芯、驱动、电机、IGBT 与 SiC 功率模块（全球少数采用 IDM 模式的公司之一）、变速器、底盘与外覆盖件，甚至发动机本体都做到了内部。到 2010 年代后期，电动车几乎每一个部件都已经在 BYD 自己的屋檐下生产。

这会形成一个正反馈回路：掌握并持续改进正确的硬件，让 BYD 能做出一种打开新市场的新产品，比如 2020 年的 [Blade Battery](https://electrek.co/2026/03/05/byds-new-ev-battery-unlocks-1000-km-range-10-min-charging/)。在 Blade Battery 出现之前，这种电池化学体系（LFP，Lithium Iron Phosphate）便宜、安全，但能量密度低，只适合那些不会离充电器太远的车辆，比如在操作员休息时充电的[叉车](https://www.emobility-engineering.com/lithium-iron-phosphate-lfp-batteries-ev/)，或每晚都会回库的公交车。可对于要应对长途驾驶和不可预测家庭充电场景的乘用电动车来说，LFP 一直被视为不可行。

![](assets/image-5.jpg)

_来源：[BYD](https://www.byd.com/eu/blog/BYDs-revolutionary-Blade-Battery-all-you-need-to-know)_

到了 2021 年，Blade Battery 采用了新的封装几何结构，把电池包空间利用率提升了 [50%](https://volta.foundation/the-next-generation-battery-pack-design-from-the-byd-blade-cell-to-module-free-battery-pack/)。这样一来，LFP 在尺寸不变的前提下，续航被推到了可行门槛附近。Tesla 把 Model 3 和 Y 切换到 LFP 电池，Ford 许可了 CATL 的 LFP 技术，而 BYD 凭借细致入微的硬件迭代，几乎在一夜之间创造出自己随后主导的现代平价电动车市场。

在 Blade Battery 之前，BYD 在 2020 年售出了 18.9 万辆新电动车。Blade Battery 之后，BYD 在 2021 年卖出了 60 万辆，而到 2025 年，BYD 不仅成为了 #1 电动车制造商，还超越 Tesla，成为 [#1 BEV producer](https://www.bbc.com/news/articles/cj9rjwpvmpzo)（纯电）厂商，这正是 Tesla 的核心产品。如今 BYD 已将流程中的极大一部分收回内部（[Seal 达到 75%](https://www.ubs.com/global/en/investment-bank/insights-and-data/2023/byd-teardown.html)），使它的成本结构几乎难以撼动，比如 2023 年的 [Seagull](https://insideevs.com/news/710364/byd-detroit-import-seagull-caresoft/) 车型只卖约 11,000 美元（新款在中国甚至[低于 8,000 美元](https://electrek.co/2025/04/08/byds-low-cost-seagull-ev-now-starts-under-8000-china/)）。BYD 甚至继续向上游延伸供应链，例如进行[与 Huayou Cobalt 在 2023 年设立精炼合资企业](https://evboosters.com/ev-charging-news/the-blueprint-of-an-ev-empire-how-byd-built-global-dominance-through-vertical-integration/)，以及在巴西“Lithium Valley”[直接获取锂矿开采权](https://www.automotivemanufacturingsolutions.com/electrification/how-chinas-byd-surpassed-tesla-with-production-and-battery-tech-reshaping-the-global-ev-market/304649)。

![](assets/image-6.jpg)

_来源：SemiAnalysis_

这种规模化把欧洲电动车厂商打得毫无还手之力，VW 因此宣布了其[史上首次](https://www.cbsnews.com/news/volkswagen-could-close-plants-in-germany-first-time-china-ev/)德国工厂关闭计划，Stellantis 也下调了[业绩指引](https://www.cnbc.com/2024/09/30/dodge-maker-stellantis-drops-profit-warning.html)，两者都明确把原因归咎于中国电动车的压力。就连美国也不得不把[对中国电动车的关税](https://www.npr.org/2024/05/14/1251096758/biden-china-tariffs-ev-electric-vehicles-5-things)提高到 100%，以保护本土产业。如今，BYD 的规模大到连自己的[运输船队](https://carnewschina.com/2025/10/02/byd-completed-its-massive-fleet-now-able-to-export-1-million-cars-a-year-but-not-just-from-china/)都有了，可以把全球最便宜、也可能是最好的电动车运往世界各地。

SemiAnalysis 是一家读者支持型出版物。若想接收新文章并支持我的工作，可以考虑成为免费或付费订阅者。

# DJI 的打法 - 小众研究者/爱好者市场也能成为可行的启动器

DJI 开创了一套不同于 BYD 的打法，而 Unitree 今天走的正是这条路：从研究者/爱好者这个滩头阵地起步，用一个质量还不算高的产品打开市场。

在 2013 年，“好用的消费级无人机”还不是一个品类。[Parrot 的 AR.Drone](https://arstechnica.com/gadgets/2013/03/esa-launches-drone-app-to-crowdsource-flight-data/)，也就是当时的领先产品，拿到的是 2010 年 CES 的 *[Electronic Gaming Hardware](https://web.archive.org/web/20110416073134/http://www.gamerlive.tv/article/ces-2010-hottest-iphone-game-world)* 奖项，还和增强现实空战游戏一起发售。这款无人机没有相机防抖、没有 GPS，只能拍 640x480p 的照片和视频。任何真正想要一台有用的飞行相机的人，只有两个选择：要么花 [19,995 美元买一台 Draganflyer X6](https://hpisavagex46.wordpress.com/2011/01/24/ubercool-inventions-draganflyer-x6-uav-helicopter-aerial-video-platform/)，要么从不同供应商那里拼凑机架、电机、flight controllers（飞控）和 gimbals（稳定器），光零件就要[花到 1,200 美元](https://hackaday.com/2011/07/27/how-to-build-your-own-quadcopter-step-by-step/)，再搭上几十个小时的装配与 PID（控制器）调参，而结果往往是代价高昂的坠机。

![](assets/image-7.jpg)

_来源：[AR Drone 2.0](https://en.wikipedia.org/wiki/Parrot_AR.Drone#/media/File:Parrot_AR.Drone_2.0_-_indoor_hull.jpg)_

研究者、爱好者，以及早期专业摄影从业者，正是愿意尝鲜的新市场。DJI 的 [Phantom 1 在 2013 年 1 月以 679 美元发售](https://www.dji.com/newsroom/news/dji-releases-all-in-one-solution-read-to-fly-phantom-quadcopter)，但在当时它并不是一款完整产品。它没有内置相机，没有 gimbal（稳定器），续航只有 10 分钟，也没有实时视频回传，但价格大约只有 DIY 无人机的一半，而且完全没有组装负担。和今天的 DJI 无人机相比，这当然还差得远，但 **Phantom 1 发布后，DJI 的营收从 2011 年的 400 万美元跃升到 2013 年的 [1.3 亿美元](https://www.wsj.com/articles/who-builds-the-worlds-most-popular-drones-1415645659)**。这已经足以启动 DJI 的飞轮。

**随后，DJI 吃到了深圳消费电子生态的红利，而这个生态已因 Smartphone 热潮变得极其庞大。**GPS 的价格在 2003-2013 年间从 [800 美元降到不到 14 美元](https://www.davidpublisher.com/Public/uploads/Contribute/65446bc585155.pdf)，控制器价格也在 2006-2011 年间[从 2,000 美元降到 400 美元](https://www.davidpublisher.com/Public/uploads/Contribute/65446bc585155.pdf)，等等。随着 DJI 的爆发，如今围绕无人机的零部件供应商已经超过 [3,000 家](https://electronics.alibaba.com/question/top-chinese-drone-manufacturers-dji,-autel,-ehang-more)，几乎你想要什么都能找到。

![](assets/image-8.jpg)

_来源：[GlobalSources](https://www.globalsources.com/knowledge/huaqiangbei-electronics-market/)_

**DJI 选择先把最贵、技术上最难的部件收回内部：flight controller（飞控）。**即便到了 2014 年，第三方供应商在数千件批量下仍卖到 200-400 美元。之后，DJI 又把 gimbals、电机和 ESCs 收回内部。

和 BYD 一样，新一代 DJI 产品打开了前一代根本触达不到的新市场。2013 年的 Phantom 1（679 美元、无相机、10 分钟续航、无实时画面）是启动器，它首先抓住了爱好者和研究者。[2014 年的 Phantom 2 Vision+](https://store.dji.com/product/phantom) 则把 3 轴 gimbal（稳定器）直接集成进机体，而在此之前，要得到达到广播级稳定性的航拍视频，通常需要在手工搭建的平台上安装一个 2,000 美元以上的后装 gimbal，并由经验丰富的飞手操控。

在 Vision+ 之前，专业航拍还是直升机和 Hollywood 的第二摄影组的地盘；而从那时起，小企业也能自己完成这项工作。因此，DJI 打开了全新的市场，例如房产房源展示、婚礼视频、本地新闻和农业测绘。到了 2016 年的 [Phantom 4](https://store.dji.com/product/phantom-4)（1,399 美元、4K 相机、28 分钟续航、前向避障、44 mph 运动模式），企业市场也被打开了：测绘、巡检、应急响应等等，我们在[这里](https://newsletter.semianalysis.com/p/robotics-levels-of-autonomy)有更详细的讨论。

![](assets/image-9.jpg)

_来源：[DJI](https://advexure.com/blogs/news/the-all-new-dji-phantom-4-the-smartest-the-sexiest-flying-gadget-ever?srsltid=AfmBOooBtAY_sBC2Eo6YAN7xBz6TFXR4VmZ3wXax3Cjx3kCreaTEvE57)_

在 2016-17 年，DJI 大约占据了全球消费级无人机 70% 的份额，而[全球无人机出货量达到 640 万台、营收达到 19 亿美元](https://www.businesswire.com/news/home/20160706005481/en/Consumer-Drone-Sales-Increase-Tenfold-67.7-Million)，这是一个此前几乎不存在的市场。多家有竞争力的无人机制造商被直接打垮。3DR、GoPro 的 Karma，以及 Parrot 的消费级产品线都已经退出或正在退出这一品类。3DR CEO Chris Anderson [估计](https://www.recode.net/2017/1/9/14182200/parrot-drone-layoffs-dji-3dr-commerical)，在 Phantom 时代，DJI 在不到一年里把价格最多砍了 70%。

为简洁起见，下文我们把这套打法统称为 **“DJI Strategy”**：掌握一个关键部件，先抓住愿意尝鲜的人群，借力生态，再让每一代硬件打开下一个市场。（这一框架的早期版本出现在[我们的第一篇机器人论文](https://newsletter.semianalysis.com/p/america-is-missing-the-new-labor-economy-robotics-part-1)中。）

# Unitree 作为早期的 DJI

Unitree 是一个活生生的 DJI Strategy 案例：掌握瓶颈部件，抓住愿意尝鲜的用户群，借力并反过来培育生态，再让每一代硬件逐步打开下一个市场。到目前为止，Unitree 已经：

- **把执行器的规模效应转化为四足机器人优势**，造出市场上成本效率最高的腿足平台。
- **再把四足项目的规模扩展到研究型人形机器人**，使 G1 成为一个规模大得出人意料的市场中的主导研究平台。
- **通过硬件改进积累出足够条件，开始进入真实世界部署**，而这个门槛正是现在跨过去的。
- **在下一代产品上释放出很有希望的改进信号，准备在人形机器人性能上与西方玩家正面竞争。**

下面我们按历史、设计与战略脉络，看看它如今在人形机器人部署上跨越的关键门槛。

2016 年，[Wang Xingxing](https://baike.baidu.com/item/%E7%8E%8B%E5%85%B4%E5%85%B4/8766961) 这位[曾在 DJI 工作过的员工](https://www.thewirechina.com/whos_who/wang-xingxing-%E7%8E%8B%E5%85%B4%E5%85%B4/)，为自己的硕士论文开发了一款低成本四足机器人 XDog。后来，他在新公司 “Unitree” 中继续迭代这台四足机器人。对 Unitree 来说，他们选择的核心部件是执行器，也就是驱动机器人四肢运动的一体化关节。就像 BYD 选择电芯、DJI 选择飞控一样，Unitree 选择了昂贵的执行器（占人形机器人 BoM 的 50%-70%）作为改进与扩张的起点。

![](assets/image-10.jpg)

_来源：[Thomas Godden](https://thomasgodden.com/actuator.html)_

Unitree 最早进入的是学术机器人社区，当时它还只是家[四足机器人公司](https://newsletter.semianalysis.com/p/quadruped-state-of-the-market-unitree)。就像当年 DJI 面对的是愿意为半成品无人机付出高价的爱好者一样，Unitree 看到的是那些想要腿足平台、却不想花 7 万到 10 万美元以上的大学实验室。[Laikago](https://spectrum.ieee.org/this-robotics-startup-wants-to-be-the-boston-dynamics-of-china) 在 2018 年发售，价格是 [45,000 美元](https://newatlas.com/laikago-quadruped-robot/59867/)。[A1](https://www.unitree.com/a1) 在 2020 年接棒，价格为 [15,000 美元](https://tribotix.com/product/a1-quadruped-robot/)；Go1 在 2021 年推出，[Air 版本起价 2,700 美元](https://spectrum.ieee.org/unitrees-go1-robot-dog-looks-pretty-great-costs-just-usd-2700)，Edu 版本最高到 8,500 美元；如今 Go2 则根据配置和地区不同，[起价在 1,600 到 2,800 美元之间](https://shop.unitree.com/)。

入门级四足机器人价格在六年里下降 94%-96%，把 Unitree 从学术圈推向消费市场，如今甚至进入[工业部署](https://newsletter.semianalysis.com/p/quadruped-state-of-the-market-unitree)，而更广泛的 AI 浪潮又进一步抬升了这类硬件的能力。更重要的是，这让 Unitree 在对人形机器人同样关键的系统上积累了多年的真实出货量：执行器、控制系统、供应商和生产流程。2024 年，Unitree 以约 9 万美元推出 H1，这台人形机器人并不像一款全新的产品，更像是其四足机器人规模曲线的直接结果。我们从接近 Unitree 的人士那里听说，H1 本质上就是一台**站起来的四足机器人**，看看它弯曲的膝盖和[别扭的步态](https://www.youtube.com/watch?v=GN2SNjctwCE)就知道了。H1 展示了四足时代的 IP 能被推到多远，但随后的 G1 改变了 Unitree 的世界。

![](assets/image-3.jpg)

_来源：[Zoomax](https://zoomax.com/the-rise-of-robotic-guide-dogs-and-chinas-technological-leadership/)_

## 3 万到 5 万美元的 G1：2024 年的一种新可能性

到了 2024 年中，市面上几乎没有便宜、可现货购买的人形机器人，直到 Unitree 出现。[Agility 的 Digit](https://www.agilityrobotics.com/) 才刚开始向工厂部署少量机器人；[Apptronik 的 Apollo](https://apptronik.com/) 于 2023 年 8 月亮相，但仍未商业化；[Figure 与 BMW 的初始商业协议](https://www.prnewswire.com/news-releases/figure-announces-commercial-agreement-with-bmw-manufacturing-to-bring-general-purpose-robots-into-automotive-production-302036263.html)签于 2024 年 1 月，出货量也还是个位数。Tesla 完全没有对外出货 Optimus（而且截至 V3 依然没有）。在中国这边，[UBTech 的 Walker](https://www.ubtrobot.com/)、Fourier，以及刚露头的 AGIBot 都已经存在，但既没有这么便宜，也没有这么大的量。那时候，没有人能随手“买到”一台人形机器人。

G1 打开了一个规模惊人的学术市场。你去问任何研究者，他们都会告诉你，一台 3 万到 5 万美元、能直接下单的人形机器人，在可获得性上到底带来了多大的跃迁。后来，这部分研究社区还通过招聘流入顶级 AI 研究公司，例如 [Nvidia、Apple 和 Meta 都采购了数百台 G1](https://semianalysis.com/core-research/)。Unitree 已经成为人形机器人 AI 研究的主导平台。

![](assets/image-11.jpg)

_来源：[Core Research](https://semianalysis.com/core-research/), Unitree 于 Robotics Summit 2025 的演示_

## 生态优势

Unitree 同时继承了 DJI 的供应商基础和 BYD 走过的历史。中国在 [2024 年生产了 3,130 万辆汽车](https://carnewschina.com/2025/01/14/china-produced-and-sold-31-282-million-and-31-436-million-vehicles-in-2024/)，其中 [40.9% 是新能源车](https://carnewschina.com/2025/01/14/china-produced-and-sold-31-282-million-and-31-436-million-vehicles-in-2024/)（BEV 或 PHEV），而前文提到的 3,000 家无人机零部件供应商，也早已把许多通用机器人可复用的 BLDC 电机、驱动、编码器、电池与制造工艺做到了规模化。不过，更能体现 Unitree 引力的，是新的人形机器人和四足机器人供应链正在崛起。如今中国每个省都有几家规格和尺寸恰到好处的 gearbox、高扭矩 BLDC 电机等制造商。在中国境内，现在已有 [约 200 家](https://cnmra.com/china-now-has-over-200-humanoid-robot-manufacturers/) 人形机器人公司，一边享受这个生态的红利，一边继续给它添砖加瓦。

![](assets/image-12.jpg)

_来源：[Leaderdrive](https://www.leaderdrive.com/product/list-7-1.html)_

这一切都源于 Unitree 当初决定把执行器做到极致。不过，它第一代执行器的表现并不好。

## 在 2024 年，它们的人形机器人并不算好

*为简洁起见，本文将 QDD 用来指代“无刷直流电机 + 低减速比行星齿轮箱”的组合，典型减速比为个位数到 20:1 以内，同时仍能提供足够的[可反驱性](https://irisdynamics.com/articles/forcefeedback-in-robotics)；不过也请注意，[命名上仍有争议](https://robot-daycare.com/posts/actuation_series_1/)。*

先说清楚一点：DJI 和 BYD 之所以能打开市场，是因为它们的产品**真的能用**，而 H1 和最初的 G1 在刚出货时**并不好用**。只要用户尝试把它们推向真实工作，电机往往就会过热。G1 在双臂完全伸直的情况下，只能举着 2 kg 的载荷，也就是一瓶 2 升汽水，撑几秒钟，然后就必须强制冷却。若是同样的 2-3 kg，但手臂保持弯曲或回收状态，则大概只能持续 2-3 分钟，正如下图所示。

![](assets/image-13.jpg)

_来源：[OmniRetarget](https://omniretarget.github.io/)_

之后，这台机器人通常要大约 30 分钟才能恢复功能，而要重新开始真正的工作任务，很可能还得再等满一小时。工作五分钟、余下大半小时都在散热的机器人，并不高产。

问题主要来自 Unitree 的核心执行器选择：**QDD，也就是 quasi-direct-drive，它比典型机器人执行器更简单、更便宜。**历史上，许多公司偏好的都是高精度、高功率的执行器，既能驱动机器人运动，也能支撑其自重。工业机械臂常用的是 [HarmonicDrives](https://www.harmonicdrive.net/technology)。Boston Dynamics 早期的人形机器人和四足机器人则使用[体积庞大的液压执行器](https://bostondynamics.com/blog/electric-new-era-for-atlas/)。即便是今天，很多人形机器人公司依然默认采用高减速比执行器，例如来自 HarmonicDrive 的 strainwave。

这些架构当然能工作，但它们价格昂贵、制造困难，而且往往很难维护。2018 年，[MIT Mini Cheetah](https://dspace.mit.edu/handle/1721.1/118671) 让 QDD（quasi-direct-drive）进入主流视野，它是一种更便宜、更简单的替代方案。真正悬而未决的问题，是 QDD 能否扩展到现实世界机器人，并证明自己足够可靠。Unitree 认为答案是可以。

[立即订阅](https://newsletter.semianalysis.com/subscribe?)

# 为什么 QDD 会有这些问题？

![](assets/image-14.jpg)

_来源：[Unitree](https://www.unitree.com/go1/motor)（电机）和 [Power Electric](https://www.powerelectric.com/motor-blog/planetary-gear-reducer-basics)（齿轮箱）_

QDD 把历史上常见的机器人关节设计完全翻了过来。传统方案是小电机配大齿轮箱，而 QDD 则是更大的电机配更小的齿轮箱。如果机器人想举起 5 kg 的东西，大致有两种办法。

- **大齿轮箱，小电机。**齿轮箱就像自行车上的低档位，用速度换力量，把电机的扭矩放大 30 倍、100 倍，某些情况下甚至 200 倍。这就是所谓的“减速比”，例如 30:1、100:1、200:1 等等（多数情况下并不是直接的一一映射）。工业机械臂之所以能用不算夸张的电机甩动整块汽车车身，就是因为齿轮箱承担了绝大部分重活。
- **小齿轮箱，大电机。**QDD 走的就是这条路，通常使用基础、可现货购买的行星齿轮箱，减速比一般低于 20:1。因为齿轮箱几乎放大不了多少扭矩，电机本身就必须强得多。要从上方把一整块汽车底盘抬起来，就需要一颗非常大的电机（我们的[四足机器人文章](https://newsletter.semianalysis.com/p/quadruped-state-of-the-market-unitree)里有更详细的 QDD 讨论）。

Unitree 的 QDD 当然也有好处，例如更容易适应外部反作用力（比如碰撞），或者实现非常快、非常动态的动作范围，但它也带来了取舍。由于电机需要直接承担更多扭矩负担，而不是主要依赖齿轮箱放大，早期批评者认为 Unitree 的电机会拉取很高电流、温度很高，并且在真实工作里不够可靠。

![](assets/image-15.jpg)

_来源：[MIT](https://dspace.mit.edu/handle/1721.1/118671) - 一个正在发热的执行器_

## 两年后，QDD 正在打破这些预期

早期的批评并不冤枉。QDD 的确让 Unitree 拿到了更便宜、更简单的执行器，但也把过多热负担压到了电机身上，这就是前面说的过热问题。**但是，** **当大多数人仍坚持 strainwave（HarmonicDrive）路线时，Unitree 选择赌一把，并不断迭代。**

过去几年里，Unitree 似乎从多个方向改进了执行器，如今已经显现出很有希望的可扩展性迹象，而且许多其他（中国）人形机器人公司也在**转向** QDD 路线，并因此**继续把生态做大**。下面我们会尽量覆盖 Unitree 已经展示出的这些改进，但先说明一下：我们拿不到循环测试数据，以下只是我们对其硬件改进所做的最佳近似判断。

先从经典公式 P=I^2R 说起，或者在这里更准确地说，热量大致与 I^2R 成正比。因此你可以做两件事：降低电机所需拉取的电流（I），或者降低电流流经绕组时遇到的电阻（R）。大多数人关注的是电流，因为它被平方了，但两者都在起作用。

减少无效电流的一个重要杠杆，是让电机在每一圈旋转中的输出扭矩更平顺。**用大白话说，就像你骑一辆轮子略微发飘的自行车，会比骑一辆真正圆正的车更费劲。每转一圈，你都得对抗一次小的阻力波峰，所以为了维持同样的速度，你平均下来必须更用力。**

![](assets/image-16.jpg)

_来源：[MQITechnology](https://mqitechnology.com/understanding-and-manipulating-cogging-torque-in-permanent-magnet-brushless-dc-motors-with-isotropic-bonded-magnets/)_

磁拉力不平顺的电机也是同样的道理：转子每转一圈都会有轻微顿挫，而你为了克服这种顿挫额外拉取的电流，最终都会直接变成热量。这些“卡顿”来自诸如 cogging torque 之类的效应，也就是转子磁铁与定子齿槽的相互作用，还来自不理想的磁场形状所造成的 torque ripple。ripple 越小，振动越少，浪费掉的电流越少，在过热之前能用上的有效扭矩也越多。

为了解决这个问题，**我们可以重新塑形或弯曲磁铁与槽口，让每次旋转之间的磁拉力保持平顺。**此外，还可以对磁铁做 skew，让定子齿轮流咬合磁场，而不是所有齿同时卡住。

另一个有用的办法，是**往电机里塞进更多铜线。**更粗、填充更密的铜线在承载同样电流时电阻更低，Unitree 把这称为它们的 [“Low Copper Consumption Coil](https://www.unitree.com/go1/motor)”。后来改名为 1X 的 Halodi 也在铜填充上做过类似优化，例如使用[更粗的方形铜线](https://x.com/boxcardavid/status/1935133276974498233?s=20)。

散热对一台能工作的机器人仍然很重要，但 Unitree 在这方面的架构其实相当保守。我们看到，它在机身大部分区域都采用**被动散热**，只有主控板和髋关节用了主动风冷，膝关节则用了 vapor chamber 均热板。Unitree **在这里也在迭代**，并在 2025 年 10 月的一次更新中，在骨盆周围加入主动散热，提升了后续 G1 批次的热裕量。

![](assets/image-17.jpg)

_来源：[JONVER Electronics](https://www.linkedin.com/pulse/teardown-unitree-g1-humanoid-robot-wiring-harness-integration-jlncc/)_

我们怀疑，Unitree 之所以没有在散热上投入太多注意力，是因为它想在降低成本与制造复杂度的同时，优先解决前面提到的核心问题：降低电机所需的电流。

## 那为什么一开始要选 QDD？先绕个小弯，说说速度与成本

Unitree 押注了 QDD，把一种在真实部署里尚未验证的架构，放在了机器人最昂贵的部件上。虽然这种方案难做，但它的效率仍然更高（95%-98%，而 strainwave 是 85%-90%），而且最多能便宜 80%。更重要的是，低减速比行星齿轮箱本身就是常见工业部件，可以在广泛可得的设备上用标准 gear hobbing 工艺加工出来，因此能形成许多供应商。

相比之下，选择 strainwave 齿轮箱的竞争对手，例如使用 HarmonicDrive 或 LeaderDrive 的方案，则要面对一个更复杂、约 13 道工序的制造流程。金属晶粒需要经过多小时热处理，才能允许其发生“flexing”（如下图所示），再加上精确到微米级容差的 hobbing 等等，最终形成了一条 HarmonicDrive 花了几十年才打磨成熟的工艺链，而即便做了 20 多年，LeaderDrive 在很多人眼里仍然落后于 HarmonicDrive 的可靠性。

![](assets/image-18.jpg)

_来源：[Nature](https://www.nature.com/articles/srep37773/figures/1)_

Unitree 没有去垂直化整条长达几十年的学习曲线，而是选择了 QDD。现在，**Unitree 的一次新 QDD 重设计，几周内就能变成执行器样品。**作个对比，一家西方人形机器人公司若要做一套定制电机与齿轮箱子系统，往往要花 3 个月以上，因为供应链交接实在太多。先是好几周规格迭代，再是 6-8 周拿到电机与齿轮箱样品，然后还得验证、重下单。结果就是，Unitree 既拿到了我们在 BoM 里展示的更低生产成本，也拥有更快的迭代速度，例如那个几乎没被外界注意到的主动骨盆散热更新。

## 从“烧坏”到轻量任务

现在，Unitree 已经把 G1 及其执行器迭代到足以胜任一些虽小但真实存在的任务，已经到了 *伸手可及* 的范围。双臂弯曲时，G1 可以连续工作 10-15 分钟以上并搬运 5 kg，相比我们最初的数据，载荷大约翻了 2 倍，持续时间大约翻了 5 倍！在双臂完全伸直时，5 kg（大致相当于一个保龄球）也能维持约 1 分钟，之后才会触及热极限。即便对人类来说，这也已经算锻炼了。但 Unitree 距离“可行”的人形机器人到底还有多远？

![](assets/image-19.jpg)

_来源：[NVIDIA](https://nvlabs.github.io/GEAR-SONIC/)_

# 正在走向真正有用的工作

Unitree 显然很便宜，我们也知道它的战略是什么、它的硬件正在如何进步，但这些真的重要吗？很多人可能会拿上一节说事，认为“能搬 5 kg 只能撑 15 分钟没什么意义”，又或者说“灵巧性不够”“它没有手”“这也不算很久”等等。然而，我们估计，除了研究/爱好者销售之外，Unitree 在 2025 年可能已经向真正有产出的工业试点或部署交付了**最多约 250 台人形机器人**。我们甚至找到了一家公司，**今天已经部署了 30 台 G1，还有多家公司部署了 5-6 台 G1**。当然，这些部署很可能仍受到软件限制（例如 AI 模型能力），因此不同方案的经济性会不一样，比如 100% 远程操控（teleoperation），而这正是我们在计算中采用的假设。

Unitree 不需要做到完美运转，也不需要长时间持续工作，而且我们本来也不期待它们做到这些。真正的问题在于，什么程度才算足以支撑有用的工作。G1 的手臂依然偏弱，它们的“degrees of freedom”也不足以做出完全类人的动作，面对过于吃力的工作仍会过热。但这只是在 G1 能做的任务类型上设下了一个**上限**，并没有给“它到底能不能做任何事”设下一个**下限**。

![](assets/image-20.jpg)

_来源：[ExtremControl](https://owenowl.github.io/extremcontrol/)_

如果不再盯着那些表演性质的后空翻，Unitree 其实已经能够完成“有用的工作”。我们在这里只做一个不穷尽的定义：

*在企业中执行、能够产生某种经济产出的任务，例如分拣箱子；或者为了减轻人类体力负担而执行的任务，例如叠衣服。*

那么，这些 Unitree 现在到底在做什么？本质上，就是把箱子或物品从 A 点搬到 B 点。目前多是轻量物料搬运，比如电商 tote（周转箱）处理，载荷在 3-5 kg 以下，甚至只是搬运空箱或空 tote。

这些还不是 24 小时、全自主的生产线，而且大多数仍由远程操控完成。尽管如此，我们仍可以证明：光是搬箱子这件事，本身就正在变得具有经济可行性。

[立即订阅](https://newsletter.semianalysis.com/subscribe?)

# Unitree 正在跨过部署可行性门槛

“*感谢 [Adamo](https://adamohq.com/) 帮助我们进一步理解远程操控部署！*”

我们在[Levels of Autonomy 论文](https://newsletter.semianalysis.com/p/robotics-levels-of-autonomy)中已经深入讨论过人形机器人的经济性，这里我们则专门为 Unitree 做一遍完整计算。以 Agility Robotics 的（非常出色的）任务为基线，再代入 Unitree 的参数，我们发现 Unitree **目前已经低于** 人类每小时 30 美元的人工成本。

![](assets/image-21.jpg)

_来源：SemiAnalysis 估算_

目前还没有任何人形机器人进入大规模生产或大规模部署阶段，大家都仍在打磨技术，而且这些数字也会随着部署不同而变化（夹爪/手、载荷、吞吐量等）。因此，我们想展示的不是绝对结论，而是它们今天大致能做到什么、在一个特定任务里会是什么样子。但也要说明：这些还是早期数据，**如果 Unitree 的硬件继续沿着现在的轨迹改进，自主能力也继续进步，那么经济性大概率只会越来越好。**

![](assets/image-22.jpg)

_来源：[Agility Robotics](https://www.agilityrobotics.com/content/gxo-signs-industry-first-multi-year-agreement-with-agility-robotics)_

## 一个很适合的任务：周转箱交接

在这个具体岗位上，Agility 扮演的是自动化系统之间的“桥梁”，例如把 tote（周转箱）从 AMRs 上搬下来，再放到传送带上。这是一种标准但很特殊的物流工作流：人类通常需要等自动化系统把货送到位才能完成交接，因此中间天然存在空闲时间。这也是为什么 Agility 每小时 [66 个 tote](https://www.automationworld.com/factory/robotics/article/55303585/agility-robotics-agility-robotics-digit-shows-promise-in-line-side-operations-with-new-iso-safety-standard-on-the-horizon)（来自会议 demo，实际部署里可能更高）的吞吐量完全够用。

![](assets/image-23.jpg)

_来源：[The Robot Report](https://www.therobotreport.com/heres-what-it-could-cost-to-hire-a-digit-humanoid/)_

此外，在 Agility 与 GXO 的部署中，这些 tote 的重量是 [2-4 kg](https://www.therobotreport.com/gxo-logistics-putting-digit-humanoid-to-test/)（这对前面说过的 Unitree 来说正合适）。轻载荷、低吞吐、失败后容易重试，而且几乎不需要复杂灵巧操作，这让它成了当前 [Level of Autonomy](https://newsletter.semianalysis.com/p/robotics-levels-of-autonomy) 下的理想任务。

![](assets/image-24.jpg)

_来源：[OmniRetarget](https://omniretarget.github.io/)_

## 计算 Unitree 的经济可行性

Agility [目前采用](https://x.com/agilityrobotics/status/1909763546671726776?s=20)的是一种 [2:1 utilization model](https://www.therobotreport.com/heres-what-it-could-cost-to-hire-a-digit-humanoid/)，也就是 2:1 利用率模型：工作 2 个单位时间、充电 1 个单位时间，因此 Digit 相对人类的**利用率为三分之二**。

![](assets/image-25.jpg)

_来源：[Agility Robotics](https://x.com/agilityrobotics/status/1909763546671726776)_

向我们反馈类似 2-4 kg tote 转运工作的 Unitree 部署方表示，Unitree 在这个任务上的吞吐量与 Digit 相当。不过，Unitree 并不是最强壮的机器人。Unitree G1 在类似任务上通常能持续工作 10-15 分钟，随后需要 5-10 分钟冷却，但这依然意味着 50%-67% 的利用率。在我们的假设里，我们保持了**非常**保守的口径：假设完全远程操控、15% 的服务合同成本（工业场景通常为 5%-10%）、两年使用寿命、残值为零，而且只跑两个班次。即便如此，这台机器人**今天**也已经能证明自己是可行的。

![](assets/image-26.jpg)

_来源：SemiAnalysis 估算_

先把保留意见说在前面：我们并不是说 Unitree 已经提供了完整方案。举例来说，Agility 拥有很好的操作系统，能与 Warehouse Management System（仓储管理系统）协同，也有更深入的功能安全体系、自己的自主能力层等等。不过对 Unitree 而言，即便是完全远程操控，在合适的商业场景下**现在**似乎也已经可行。

[立即订阅](https://newsletter.semianalysis.com/subscribe?)

## 接下来会走向哪里

据我们所知，这应该是 Unitree 人形机器人第一次在部署中展示出真正有用的工作。倒不是说这个任务本身有多么特殊，也不是说它是个 100T TAM（总可服务市场），但它说明 Unitree 可能正在跨过某个门槛，而它的轨迹非常惊人。回想一下，DJI 当初向小众爱好者市场发出一台还不完美的无人机，营收就暴涨了 32 倍，很快把自己送上无人机霸主的位置。最开始的时候，G1 连抱着一个箱子站 2-3 分钟都会过热。迄今为止这些性能改进，都是由爱好者/研究者市场的收入支撑起来的。如果 Unitree 只要打开仓储 TAM 的一小块，进步速度都可能陡然加快到惊人的程度。

随着机器人 AI 模型[展现出新能力](https://www.pi.website/blog/pi07)的迹象越来越明显，BoM 不断下降，硬件质量也持续改善，Unitree 可能会成为市场上最便宜、同时又足够称职的人形机器人平台。接下来我们来聊聊，它是如何把 BoM 做到世界领先的 8,976 美元的。

# 中国的制造能力

到目前为止，本文已经多次暗示 Unitree 的制造能力以及其周围生态。对于机器人以及许多其他行业来说，如果想在全球范围内竞争，和中国生态协同几乎是必要条件，因为这里的供应商坐火车几个小时就能见到，样品当天或次日就能送达，垂直迭代周期按周算而不是按季度算，而且零部件价格还能比西方同类低 20%-40%。需要说明的是，例如 Leaderdrive 的 strainwave 齿轮箱，有时只卖到 HarmonicDrive 的**三分之一**，当然 HarmonicDrive **目前**仍是可靠性领导者。

大多数美国机器人初创公司其实已经在和中国供应链合作，例如 Sunday Robotics、Dyna 和 XDOF，它们的硬件团队都设在中国。就连 Tesla Optimus 也依赖中国供应链，而且很可能还会[继续如此](https://www.scmp.com/tech/tech-trends/article/3341953/optimus-chain-chinese-suppliers-form-backbone-teslas-humanoid-robot-initiative)。

## Unitree 的垂直整合非常惊人，即便放在中国也是如此

中国生态当然很强，但前文我们反复强调垂直整合的价值，所以这里再展开一点。Unitree 自研 BLDC 电机、行星齿轮箱、LiDAR 和深度相机，而这些部件通常都是其他中国人形机器人 OEM 外包的，甚至 Unitree 自己过去也外包过。如今，Unitree 自产电机的成本可以低到同等级西方电机的 30%-40%，而且**它现在做出了全球最便宜的人形机器人齿轮箱之一。**

![](assets/image-27.jpg)

_来源：[IQSDirectory](https://www.iqsdirectory.com/articles/gear/planetary-gears.html)_

这些优势在 IPO 文件里也体现得非常明显。在 Unitree 向上海证券交易所（SSE）提交的 [First Round Inquiry Response](https://static.sse.com.cn/stock/disclosure/announcement/c/202603/002178_20260320_OE27.pdf) 中，它明确表示，生产规模扩大让它获得了**上游议价权**，并由此形成了持久的成本优势。

![](assets/image-28.jpg)

_来源：[Unitree First Round Inquiry Response, 8-1-1-14](https://static.sse.com.cn/stock/disclosure/announcement/c/202603/002178_20260320_OE27.pdf)_

这直接体现在其四足机器人毛利率从 **42.36%** 提升到 **55.49%**，同时成本几乎**减半。**不过，SemiAnalysis 的订阅者其实早在[去年 9 月](https://newsletter.semianalysis.com/p/quadruped-state-of-the-market-unitree)就已经知道这些四足机器人毛利数据了。

![](assets/image-29.png)

_来源：[SemiAnalysis](https://newsletter.semianalysis.com/p/quadruped-state-of-the-market-unitree)_

这种垂直整合在西方市场看来堪称奇观，但即便在硬件利润薄如刀片、为了生存就必须垂直整合的中国市场里，它也一样突出。前文的 BYD 和 DJI 已经展示了它们如何靠垂直整合走向主导。UBTECH 和 AGIBot（中国两家主要人形机器人竞争对手）也在[积极推进](https://biz.chosun.com/en/en-industry/2026/03/20/CNMGR4IU6ZAAHKJFX7WEXCYSXY/)更多硬件环节的掌控，例如齿轮箱、电机等，而这些恰恰都是 Unitree 已经自研的部件。

UBTECH 和 AGIBot 目前仍然大量依赖 ODM/OEM 合作伙伴来完成制造，某些情况下连总装也外包，比如 AGIBot 把欧洲生产外包给了位于塞尔维亚的 Minth Group。即便如此，AGIBot 的完整技术转移授权价格也达到 400 万美元，它是通过合作伙伴扩张，而不是自己吃下制造学习曲线。与此同时，Unitree 在其 S-1 中表示，计划把更多开发环节收回内部，包括“tooth-profile design, simulation optimization, material validation, and high-precision machining”。

不过，无论是 Unitree 还是其他人形机器人公司，目前都还没有进入高产量生产阶段。这意味着，即便未来继续扩大产量，从 first-mover 的角度看，Unitree 仍很可能维持一种**结构性成本优势**。未来我们会专门写一篇文章，把中国工业生态的全貌展开讲清楚；但在这里，你只需要先接受一个前提：大多数人形机器人都会从中国采购，而即便放在中国，Unitree 也依然是个异类。

# 结论

当西方制造商过去和现在都还在做原型验证时，Unitree 已经盈利地出货了数以万计的四足机器人，搭起了整个人形机器人市场，并开始进入真正有用的人形工作场景。所有人都该思考一个问题：Unitree 会走到哪里才停？BYD 最初只有电芯，DJI 最初只有控制器，而今天它们都成了行业巨头。

看着 Unitree 通过多种机器人形态不断加速成功，并逐步巩固制造优势，它很可能会继续以同样的节奏扩张，打开过去根本无法想象的市场。

现在，让我们聊聊机器人手，以及哪些 Unitree 供应商可能会从中受益。这些内容如今都在付费墙之后。

# 机器人手与造手公司

机器人手可能是为我们的 Unitree 打开更多任务空间的关键，但设计一只机器人手本身就是全新的挑战。目前看起来有两条路线：

关节驱动（Joint-actuated）：这种架构会在每个关节上放置一个执行器来控制运动。它可以很精确，但也可能非常昂贵、体积庞大，或在载荷能力上不够强。

腱驱动（Tendon-driven）：这种方案把执行器放在前臂，通过牵引肌腱来驱动手指。这样能让手更轻，很多人也认为它更“准确”。但要让肌腱完成动作，建模本身就是挑战；持续拉紧时也会过热，而且肌腱还会因反复弯折疲劳而不断磨损甚至断裂。

![](assets/image-30.jpg)

_来源：[1X](https://www.1x.tech/discover/introducing-neo-gamma)_

现在还不清楚哪种路线会胜出，因为两者各有优缺点，但有些人认为腱驱动才是更优路径，因为它的动作更“像人”，驱动能力也更强。

在中国，[Inspire](https://inspire-robots.com/)、[Sharpa](https://interestingengineering.com/ai-robotics/sharpas-advanced-robotic-hand-enters-mass-production)、[Robotera](https://www.robotera.com/en/#/home)、Tencent 分拆出来的 [Dexcel](https://www.youtube.com/watch?v=124mQZpmFPg) 等许多公司都在争夺“最好机器人手”的位置。那些灵巧度更高的手价格也很夸张，例如 Sharpa 每只大约就要 5 万美元。

在美国，正在崛起的机器人手公司包括 [Proception](https://www.proception.ai/)、[Origami Robotics](https://www.origami-robotics.com/) 和 [Kyber Labs](https://kyberlabs.ai/) 等。此外，1X 似乎也做出了一只相当出色的腱驱动机器人手，并宣称其循环次数远高于 Optimus 的手。这很可能要归功于不同材料（例如 [Dyneema](https://www.dyneema.com/)）以及系统级集成（避免弯折疲劳），但它面对的依然是和 Tesla 相同的问题。

![](assets/image-31.jpg)

_来源：[Interesting Engineering](https://interestingengineering.com/ai-robotics/sharpas-advanced-robotic-hand-enters-mass-production)_

有意思的是，就像 Unitree 正在主导学术机器人学习市场一样，上图中的 Sharpa 也一直非常积极地联系许多学术与[产业](https://research.nvidia.com/labs/gear/egoscale/)实验室，推动活跃合作。现在甚至到了这样一种程度：它愿意让实验室借用这些机器人手，有些还是极大折扣，甚至会要求参与每周项目例会。这是一场值得一赌的尝试，因为如果未来几年的机器人手研究建立在它们的硬件之上，Sharpa 将从中获得巨大利益。而从许多[最近](https://x.com/kushalk_/status/2026360279844724975?s=20)的[研究](https://x.com/DrJimFan/status/2026709308713611695?s=20)成果看（NVIDIA 的 [GEAR](https://research.nvidia.com/labs/gear/) 实验室是知名大用户），这件事似乎已经在发生了。

# Unitree 的供应商：谁会受伤，谁能活下来

我们认为，随着 Unitree 规模继续扩大，它会把更多零部件和模块收回内部，以拿走更多利润，但不会动到底层硅供应商。最明显会受到冲击的供应商是：

[Livox](https://www.livoxtech.com/)（DJI 的 LiDAR 子公司）。最早的 G1 使用 Livox MID360，其 BoM 大约在 550 美元以上，是单个最贵组件，约占总 BoM 的 9.2%。Unitree 自研 LiDAR 把这项成本压到约 250-300 美元，而据称 H2 [甚至不再使用](https://blog.robozaps.com/b/unitree-h2-review) LiDAR 或深度相机。因此，尽管在 [IPO 文件](https://robottoday.com/article/unitree-robotics-files-ipo-china-s-humanoid-robot-leader-targets-42-b-valuation) 中 Livox 仍是重要供应商，我们预计这部分占比会明显收缩。

![](assets/image-32.jpg)

_来源：[Livox](https://www.livoxtech.com/mid-360s)_

[Orbbec](https://www.orbbec.com/) 和 [RealSense](https://www.realsenseai.com/)。它们都是向 Unitree 供应深度相机的厂商，也面临与 Livox 类似的局面，因为 Unitree 已经开始自制深度相机，而不是继续外采。

![](assets/image-33.jpg)

_来源：[Orbbec](https://www.orbbec.com/gemini-305/)_

不过，硅供应商是安全的。对它们来说，Unitree 是直接买现成的 Livox MID360 模块，还是自己做 LiDAR，其实都无所谓，因为底层仍然需要同样的硅。差别只是，Unitree 现在可以直接采购同样的 Sony 传感器和中国晶圆厂制造的 ASICs，这很可能是在走 [RoboSense 的模式](https://semianalysis.com/)，也就是直接向 Sony 的传感器部门采购。

此外，除了 Sony 之外，我们还看到几家会从这个趋势中受益的公司。[Rockchip](https://www.rock-chips.com/a/en/) 会因 G1 基座中的 RK3588S 而受益，[LONGSYS](https://www.longsys.com/) 提供 64GB 存储，而 [BIWIN](https://www.biwin.com/) 提供 8GB 内存。NVIDIA 也会通过 G1 EDU 中的 Jetson Orin NX 模块（100 TOPS）受益，这些模块是[根据 IPO 文件通过 Beijing Plink AI Technology 采购的](https://www.kharon.com/brief/unitree-robotics-ipo-china-pla-robot-wolf)。当然，如果中国边缘加速器变得更有竞争力，这种情况也可能变化，因为 Unitree 目前还没有切换到中国国产板载算力。最后，[CMSEMICON](https://www.mcu.com.cn/en/) 供应电机驱动板的 MCU 和 gate-driver SiP，很可能就是 CMS32M5733Q048。这一点是通过[最近一次开源逆向工程工作](https://github.com/thomasfla/go2_motor_analysis)识别出来的，因为 Unitree 会故意用激光去除封装标记，防止被逆向。
