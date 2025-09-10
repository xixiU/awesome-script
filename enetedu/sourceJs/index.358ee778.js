import {p as rt, I as ut, i as dt, _ as ct} from "./pause.0e76e3d6.js";
import {a as vt, r as i, b as mt, f as pt, L as ft, h as gt, K as S, Q as Oe, a$ as _t, o as m, i as z, j as d, w as r, k as g, y as W, p as k, u as E, c as w, O as h, ds as yt, au as Te, F as ht, l as bt, ci as St, t as Tt, S as It, ao as kt, cY as wt, R as xt, cK as Nt, x as Pt, bP as zt} from "./entry.19ee18d5.js";
import Ct from "./assistant.b46e39da.js";
import {f as Mt} from "./frame.176419d9.js";
import Vt from "./videoCarousel.9ca02ec8.js";
import At from "./videoSubtitle.545bc8f6.js";
import Lt from "./videoGist.94f06233.js";
import {R as Ft, _ as Et} from "./ReorderFour.8c42b44e.js";
import {_ as Dt, a as Ot} from "./Tabs.9f4d8c18.js";
import {N as Ut} from "./Scrollbar.45f78c64.js";
import {_ as $t} from "./_plugin-vue_export-helper.c27b6911.js";
import "./hls.07b9f711.js";
import "./CaretForwardCircleOutline.254ef9f4.js";
import "./Scan.af71168e.js";
import "./VolumeMuteOutline.442c6792.js";
import "./small-logo.23b41046.js";
import "./index.160cb771.js";
/* empty css                */
import "./fetch.0c2de77a.js";
import "./Spin.2e088303.js";
import "./Flex.93205509.js";
import "./course_defaultImg.ed4feae4.js";
import "./Carousel.07b502e6.js";
import "./_createCompounder.660643da.js";
import "./avatar.1b015693.js";
import "./Divider.57c33a3b.js";
import "./throttle.ba04146a.js";
import "./debounce.bf92d1a0.js";
import "./toNumber.05cffcec.js";
const Kt = {
    class: "vdeolessons_content"
}
  , Bt = {
    class: "vdeolessons_left"
}
  , qt = {
    class: "vdeolessons_info"
}
  , jt = {
    class: "lesson-title-wrap"
}
  , Qt = {
    class: "lesson-title"
}
  , Wt = {
    class: "lesson-content"
}
  , Gt = {
    class: "content_right"
}
  , Jt = {
    class: "ai-input-header"
}
  , Yt = {
    key: 0,
    class: "ai-buttons-container"
}
  , Ht = {
    class: "ai-input-body"
}
  , Xt = ["src", "onClick"]
  , Zt = ["src"]
  , Rt = {
    style: {
        display: "flex",
        "justify-content": "space-between"
    }
}
  , ea = {
    style: {
        padding: "0 2px"
    }
}
  , ta = {
    class: "videoNote"
}
  , aa = {
    class: "top"
}
  , na = {
    class: "left"
}
  , ia = ["onClick"]
  , oa = {
    class: "bottom"
}
  , la = {
    key: 0,
    style: {
        "margin-top": "10px",
        color: "red"
    }
}
  , sa = {
    style: {
        height: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center"
    }
}
  , ra = vt({
    __name: "index",
    setup(ua) {
        const G = i(null)
          , J = i(null)
          , Ue = i(null)
          , D = i(0)
          , ne = i(!1)
          , Ie = JSON.parse(localStorage.getItem("activateAi") || "0")
          , C = i([])
          , Y = i([])
          , M = i(0)
          , ce = i(!1)
          , x = i(!1)
          , ke = i(!1)
          , O = i([])
          , ie = i(0)
          , {useMessageRequest: U} = mt()
          , N = pt()
          , b = ft()
          , c = i([])
          , p = i([])
          , l = i(null)
          , ve = i("")
          , oe = i("")
          , P = i("")
          , V = i(!1)
          , $e = i(!1)
          , me = i([])
          , $ = i(0)
          , H = i("课程笔记")
          , we = xe()
          , T = i("")
          , _ = i(null)
          , I = i(null)
          , Ke = i(!1)
          , X = i(null)
          , pe = i(!1)
          , fe = xe()
          , Be = i(!1)
          , le = i(!1);
        function xe() {
            return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`
        }
        gt( () => {
            je(),
            qe(),
            document.addEventListener("visibilitychange", Pe),
            window.addEventListener("beforeunload", se),
            window.addEventListener("pagehide", se)
        }
        );
        function qe() {
            X.value = new BroadcastChannel("video-playback"),
            X.value.onmessage = e => {
                e.data.type === "play" && e.data.tabId !== fe ? (pe.value = !0,
                ge(),
                b.warning("已有浏览器标签正在播放，无法观看")) : e.data.type === "pause" && e.data.tabId !== fe && (pe.value = !1)
            }
        }
        function Ne(e) {
            X.value && X.value.postMessage({
                type: e ? "play" : "pause",
                tabId: fe,
                videoId: p.value[0]
            })
        }
        function Pe() {
            document.visibilityState === "hidden" && !Be.value && (b.warning("检测到您在其他标签页操作，当前视频已暂停"),
            ge())
        }
        function ge() {
            l.value && (l.value.pauseVideo(),
            Z(!1))
        }
        function _e(e) {
            var n;
            const t = (n = l.value) == null ? void 0 : n.getMaxPlaytime()
              , a = typeof e == "string" ? A(e) : e;
            if (t !== void 0 && a > t) {
                b.warning("您还未观看到此课程的播放时间，请耐心观看");
                return
            }
            try {
                l.value.setStartTime(a)
            } catch (o) {
                console.error("设置播放时间失败:", o),
                b.error("设置播放时间失败")
            }
        }
        function je() {
            U({
                k: "site/learningCourseTreeList",
                method: "GET",
                params: {
                    courseId: N.query.courseId,
                    type: 1
                },
                disabledSuccess: !0,
                onSuccess(e) {
                    e.map(a => {
                        a.labelName = a.fileName && a.type === 1 ? (a.chapterName ? a.chapterName + "-" : "") + a.fileName : a.chapterName
                    }
                    ),
                    c.value = e,
                    ce.value = !1,
                    x.value = !1;
                    const t = async a => {
                        if (a) {
                            ve.value = a.fileName;
                            const n = A(a.duration)
                              , o = A(a.maxPlayedTime)
                              , s = await ye(a);
                            S( () => {
                                a != null && a.videoId && (a == null ? void 0 : a.smartTranscription) === 1 && (a == null ? void 0 : a.taskStatus) == 1 && (he(a.videoId),
                                be(a.videoId)),
                                l.value.setVideoSrc(s),
                                l.value.setStartTime(Number(n), Number(o))
                            }
                            )
                        }
                    }
                    ;
                    if (N.query.selectId) {
                        p.value = [N.query.selectId];
                        const a = e.find(n => n.id === N.query.selectId);
                        t(a)
                    } else
                        c.value.length > 0 && (p.value = [c.value[0].id],
                        t(c.value[0]));
                    S( () => {
                        H.value === "课程笔记" && re()
                    }
                    )
                }
            })
        }
        async function ye(e) {
            var t;
            try {
                const a = await U({
                    k: "site/getMediaTranscodeInfo",
                    method: "post",
                    data: {
                        courseId: N.query.courseId,
                        videoId: e.videoId,
                        chapterId: e.chapterId,
                        fileName: e.fileName
                    },
                    disabledSuccess: !0
                });
                return O.value = ((t = a.data) == null ? void 0 : t.transcodeOutputs) || [],
                O.value.length > 0 ? O.value[0].playUrl : e.filePath
            } catch (a) {
                return console.error("获取转码视频失败:", a),
                e.filePath
            }
        }
        function Qe(e) {
            if (e < 0 || e >= O.value.length)
                return;
            ie.value = e;
            const t = O.value[e].playUrl
              , a = l.value.getPlaytime();
            l.value.setVideoSrc(t),
            S( () => {
                l.value.setStartTime(a),
                ne.value && setTimeout( () => {
                    l.value.playVideo()
                }
                , 500)
            }
            )
        }
        function he(e) {
            U({
                k: "site/getMediaMeetInfo",
                method: "GET",
                params: {
                    mediaId: e
                },
                loadings: Ke,
                disabledSuccess: !0,
                onSuccess(t) {
                    var a, n, o, s, y, u, f, q, R, ue, de;
                    x.value = !0,
                    I.value = t || null,
                    (n = (a = t == null ? void 0 : t.transcription) == null ? void 0 : a.Transcription) != null && n.Paragraphs && ((y = (s = (o = t == null ? void 0 : t.transcription) == null ? void 0 : o.Transcription) == null ? void 0 : s.Paragraphs) != null && y.length) ? (C.value = We((f = (u = t == null ? void 0 : t.transcription) == null ? void 0 : u.Transcription) == null ? void 0 : f.Paragraphs),
                    H.value = "智能伴学") : C.value = [],
                    (q = t == null ? void 0 : t.autoChapters) != null && q.AutoChapters && ((R = t == null ? void 0 : t.autoChapters) != null && R.AutoChapters.length) ? ((ue = t == null ? void 0 : t.autoChapters) == null || ue.AutoChapters.map(j => {
                        j.Start = parseFloat((j.Start / 1e3).toFixed(2)),
                        j.StartTime = ze(j.Start)
                    }
                    ),
                    Y.value = (de = t == null ? void 0 : t.autoChapters) == null ? void 0 : de.AutoChapters) : Y.value = []
                }
            })
        }
        function be(e) {
            ce.value = !0,
            S( () => {
                var t;
                (t = Ue.value) == null || t.sendMessage(e)
            }
            )
        }
        function We(e) {
            return e.map(t => {
                if (!t.Words || t.Words.length === 0)
                    return null;
                const a = t.Words[0]
                  , n = parseFloat((a.Start / 1e3).toFixed(2))
                  , o = ze(n)
                  , s = {};
                t.Words.forEach(u => {
                    const f = u.SentenceId;
                    s[f] || (s[f] = {
                        text: "",
                        startTime: parseFloat((u.Start / 1e3).toFixed(2)),
                        endTime: parseFloat((u.End / 1e3).toFixed(2))
                    }),
                    s[f].text += u.Text,
                    s[f].endTime = parseFloat((u.End / 1e3).toFixed(2))
                }
                );
                const y = Object.values(s).sort( (u, f) => u.startTime - f.startTime);
                return {
                    paragraphStartTimeSec: n,
                    paragraphStartTimeFormatted: o,
                    sentences: y
                }
            }
            ).filter(Boolean)
        }
        function ze(e) {
            const t = Math.floor(e)
              , a = Math.floor(t / 3600)
              , n = Math.floor(t % 3600 / 60)
              , o = t % 60;
            return [a.toString().padStart(2, "0"), n.toString().padStart(2, "0"), o.toString().padStart(2, "0")].join(":")
        }
        function A(e) {
            if (!e)
                return 0;
            try {
                if (/^\d+$/.test(e))
                    return parseInt(e, 10);
                const t = e.split(":").map(Number);
                if (t.some(St))
                    return console.warn(`Invalid time format: ${e}`),
                    0;
                switch (t.length) {
                case 1:
                    return t[0];
                case 2:
                    return t[0] * 60 + t[1];
                case 3:
                    return t[0] * 3600 + t[1] * 60 + t[2];
                default:
                    return console.warn(`Unsupported time format: ${e}`),
                    0
                }
            } catch (t) {
                return console.error(`Error parsing time string: ${e}`, t),
                0
            }
        }
        Oe(p, (e, t) => {
            t.length > 0 && B(t[0])
        }
        ),
        Oe(ne, e => {
            console.log("播放状态变化:", e ? "开始" : "停止")
        }
        );
        function Ge() {
            if (!P.value)
                return b.warning("请输入笔记内容！");
            const e = c.value.find(a => a.id === p.value[0]);
            if (!e)
                return b.warning("未找到课程信息");
            let t = {
                courseId: e.courseId,
                courseName: e.courseName,
                mediaId: e.videoId,
                fileName: e.fileName,
                type: 1,
                title: oe.value ? oe.value : P.value.slice(0, 20),
                content: P.value,
                point: V.value ? K($.value) : null,
                topicId: N.query.topicId,
                cardNumber: N.query.cardNumber
            };
            U({
                k: "backstage/courseNotesCreate",
                method: "POST",
                data: t,
                loadings: ke,
                onSuccess() {
                    oe.value = "",
                    P.value = "",
                    V.value = !1,
                    $.value = 0,
                    re()
                }
            })
        }
        function Je() {
            if (M.value === 0) {
                b.warning("视频还未开始播放，无法生成课程笔记");
                return
            }
            for (let e = 1; e <= 999; e++) {
                const {fullText: t, firstSentence: a, startTime: n} = Ye(e);
                if (t) {
                    oe.value = a.length > 20 ? a.substring(0, 20) : a,
                    P.value = t,
                    V.value = !0,
                    $.value = n,
                    e > 1 && b.success("已获取字幕内容生成笔记");
                    return
                }
            }
            b.warning("未能获取视频字幕内容")
        }
        function Ye(e) {
            if (!C.value.length || M.value === 0)
                return {
                    fullText: "",
                    firstSentence: "",
                    startTime: 0
                };
            const t = Math.max(0, M.value - e * 60)
              , a = M.value;
            let n = ""
              , o = ""
              , s = 1 / 0;
            for (const y of C.value) {
                if (y.paragraphStartTimeSec > a)
                    break;
                if (y.paragraphStartTimeSec >= t)
                    for (const u of y.sentences)
                        u.startTime >= t && u.endTime <= a && (s = Math.min(s, u.startTime),
                        o || (o = u.text),
                        n += `${u.text} `)
            }
            return {
                fullText: n.trim() || "",
                firstSentence: o || "",
                startTime: dt(s) ? s : 0
            }
        }
        function He() {
            $.value = l.value.getPlaytime()
        }
        function K(e) {
            const t = new Date(0);
            t.setSeconds(e);
            const a = Number(t.toISOString().substring(11, 13))
              , n = Number(t.toISOString().substring(14, 16)) + a * 60
              , o = t.toISOString().substring(17, 19);
            return n + ":" + o
        }
        function Xe() {
            G.value || J.value || (G.value = setInterval( () => {
                D.value += 1
            }
            , 1e3),
            J.value = setInterval( () => {
                B()
            }
            , 6e4),
            ne.value = !0)
        }
        function Z(e=!0) {
            G.value && clearInterval(G.value),
            J.value && clearInterval(J.value),
            G.value = null,
            J.value = null,
            ne.value = !1,
            e && D.value && B()
        }
        function Ze(e) {
            var t, a;
            if (pe.value) {
                ge();
                return
            }
            Ne(!0),
            !((t = l.value) != null && t.isLoading()) && !((a = l.value) != null && a.isBuffering()) && (console.log("视频播放开始", "触发接口"),
            Xe())
        }
        function Re(e) {
            var t, a;
            Ne(!1),
            !((t = l.value) != null && t.isLoading()) && !((a = l.value) != null && a.isBuffering()) && (console.log("播放暂停", "触发接口"),
            Z())
        }
        function et(e) {
            console.log("播放结束", "触发接口"),
            Z()
        }
        async function tt() {
            if (p.value[0] === c.value[c.value.length - 1].id) {
                b.warning("已经是最后一部视频了！");
                return
            } else {
                const e = c.value[c.value.indexOf(c.value.find(o => o.id === p.value[0])) + 1];
                ie.value = 0;
                const t = await ye(e)
                  , a = A(e.duration)
                  , n = A(e.maxPlayedTime);
                p.value = [e.id],
                ve.value = e.fileName,
                S( () => {
                    e != null && e.videoId && (e == null ? void 0 : e.smartTranscription) === 1 && (e == null ? void 0 : e.taskStatus) == 1 && (he(e.videoId),
                    be(e.videoId)),
                    l.value.setVideoSrc(t),
                    l.value.setStartTime(Number(a), Number(n)),
                    l.value.playVideo()
                }
                )
            }
        }
        async function B(e) {
            var u, f;
            if ((u = l.value) != null && u.isLoading() || (f = l.value) != null && f.isBuffering())
                return;
            const t = e || p.value[0]
              , a = c.value.find(q => q.id === t);
            if (!a || a.type !== 1)
                return;
            const n = l.value.getPlaytime()
              , o = l.value.getMaxPlaytime()
              , s = D.value || n;
            if (!s)
                return;
            const y = {
                videoId: a.videoId,
                courseId: a.courseId,
                chapterId: a.chapterId,
                fileName: a.fileName,
                pid: a.pid,
                duration: K(n),
                totalDuration: K(s),
                maxPlayedTime: K(o)
            };
            return await U({
                k: "site/createLearningInfo",
                method: "POST",
                data: y,
                disabledSuccess: !0,
                onSuccess() {
                    D.value = 0,
                    a.duration = K(n)
                }
            })
        }
        function se(e) {
            return B(),
            e.preventDefault(),
            e.returnValue = "",
            ""
        }
        function at(e) {
            H.value = e,
            e === "课程笔记" && (P.value = "",
            V.value = !1,
            $.value = 0,
            re())
        }
        function Se(e) {
            e === "zlzywt" ? S( () => {
                var t, a, n, o;
                (o = _.value) == null || o.addParagraphSummary(e, (n = (a = (t = I.value) == null ? void 0 : t.summarization) == null ? void 0 : a.Summarization) == null ? void 0 : n.QuestionsAnsweringSummary)
            }
            ) : e === "zlkczynr" ? S( () => {
                var t, a, n, o;
                (o = _.value) == null || o.addParagraphSummary(e, (n = (a = (t = I.value) == null ? void 0 : t.meetingAssistance) == null ? void 0 : a.MeetingAssistance) == null ? void 0 : n.KeySentences)
            }
            ) : e === "zlgjz" && S( () => {
                var t, a, n, o;
                (o = _.value) == null || o.addParagraphSummary(e, (n = (a = (t = I.value) == null ? void 0 : t.meetingAssistance) == null ? void 0 : a.MeetingAssistance) == null ? void 0 : n.Keywords)
            }
            )
        }
        async function re() {
            const e = c.value.find(t => t.id === p.value[0]);
            if (e)
                try {
                    await Promise.all([U({
                        k: "backstage/courseNotesPage",
                        method: "GET",
                        params: {
                            pageNo: 1,
                            pageSize: 1e3,
                            courseId: N.query.courseId,
                            mediaId: e.videoId,
                            type: 1
                        },
                        disabledSuccess: !0,
                        onSuccess(t) {
                            me.value = (t == null ? void 0 : t.list) || []
                        }
                    })])
                } catch (t) {
                    throw console.error("获取数据失败:", t),
                    t
                }
        }
        function nt(e) {
            if (e.shiftKey || e.ctrlKey) {
                const t = e.target
                  , a = t.selectionStart
                  , n = t.selectionEnd;
                T.value = T.value.substring(0, a) + `
` + T.value.substring(n),
                S( () => {
                    t.focus(),
                    t.selectionStart = t.selectionEnd = a + 1
                }
                )
            } else {
                if (!(_ != null && _.value.isReply))
                    return;
                Ce()
            }
        }
        function Ce(e) {
            var t;
            T.value.trim() && ((t = _.value) == null || t.sendMessage(T.value, we),
            T.value = "")
        }
        _t( () => {
            var e;
            console.log("页面卸载了"),
            console.log("页面卸载，保存观看时长", D.value),
            D.value && B(),
            Z(),
            document.removeEventListener("visibilitychange", Pe),
            window.removeEventListener("beforeunload", se),
            window.removeEventListener("pagehide", se),
            (e = X.value) == null || e.close()
        }
        );
        async function it(e) {
            if (!e || e.id === p.value[0])
                return;
            Z(),
            ce.value = !1,
            x.value = !1,
            ve.value = e.fileName,
            ie.value = 0;
            const t = await ye(e)
              , a = A(e.duration)
              , n = A(e.maxPlayedTime);
            S( () => {
                p.value = [e.id],
                re(),
                l.value.setVideoSrc(t),
                l.value.setStartTime(Number(a), Number(n)),
                e != null && e.videoId && (e == null ? void 0 : e.smartTranscription) === 1 && (e == null ? void 0 : e.taskStatus) == 1 && (he(e.videoId),
                be(e.videoId))
            }
            )
        }
        function ot(e) {
            M.value = e
        }
        i({}),
        i(null);
        async function lt() {
            le.value || (le.value = !0,
            await B(),
            le.value = !1)
        }
        return (e, t) => {
            const a = ct
              , n = Tt
              , o = It
              , s = Dt
              , y = kt
              , u = wt
              , f = xt
              , q = Nt
              , R = Pt
              , ue = zt
              , de = Ut
              , j = Ot
              , st = Et;
            return m(),
            z("div", Kt, [d(st, {
                direction: "horizontal",
                "resize-trigger-size": 16,
                "default-size": .65,
                max: .7,
                min: .3
            }, {
                1: r( () => {
                    var v, L, Q, ee, te, ae;
                    return [g("div", Bt, [d(a, {
                        ref_key: "rVideoPalyerRef",
                        ref: l,
                        transcodeOutputs: O.value,
                        currentTranscodeIndex: ie.value,
                        isDebug: $e.value,
                        onPlay: Ze,
                        onPause: Re,
                        onEnded: et,
                        onNext: tt,
                        onTimeUpdate: ot,
                        onTranscodeIndex: Qe
                    }, null, 8, ["transcodeOutputs", "currentTranscodeIndex", "isDebug"]), g("div", qt, [g("div", jt, [g("h2", Qt, W((Q = (L = (v = I.value) == null ? void 0 : v.summarization) == null ? void 0 : L.Summarization) == null ? void 0 : Q.ParagraphTitle), 1), d(n, {
                        type: "primary",
                        loading: le.value,
                        onClick: lt
                    }, {
                        default: r( () => [k("保存进度")]),
                        _: 1
                    }, 8, ["loading"])]), g("div", Wt, W((ae = (te = (ee = I.value) == null ? void 0 : ee.summarization) == null ? void 0 : te.Summarization) == null ? void 0 : ae.ParagraphSummary), 1), d(Vt, {
                        currentVideoId: p.value[0],
                        list: c.value,
                        onSelectChange: it
                    }, null, 8, ["currentVideoId", "list"])])])]
                }
                ),
                2: r( () => [g("div", Gt, [d(j, {
                    value: H.value,
                    "onUpdate:value": t[7] || (t[7] = v => H.value = v),
                    type: "line",
                    animated: "",
                    "on-update:value": at,
                    class: "custom-tabs",
                    style: {
                        background: "#fff",
                        padding: "16px",
                        "border-radius": "4px"
                    }
                }, {
                    default: r( () => [E(Ie) == "1" && c.value && p.value[0] && c.value.length ? (m(),
                    w(s, {
                        key: 0,
                        name: "智能伴学",
                        tab: "智能伴学",
                        "display-directive": "show"
                    }, {
                        default: r( () => {
                            var v, L, Q, ee, te, ae, Me, Ve, Ae, Le, Fe, Ee, De;
                            return [g("div", Jt, [d(Ct, {
                                searchContent: T.value,
                                ref_key: "assistantRef",
                                ref: _,
                                sessionId: E(we)
                            }, null, 8, ["searchContent", "sessionId"])]), x.value ? (m(),
                            z("div", Yt, [(Q = (L = (v = I.value) == null ? void 0 : v.meetingAssistance) == null ? void 0 : L.MeetingAssistance) != null && Q.KeySentences ? (m(),
                            w(n, {
                                key: 0,
                                size: "small",
                                disabled: !((ee = _.value) != null && ee.isReply),
                                type: "success",
                                ghost: "",
                                onClick: t[0] || (t[0] = F => Se("zlkczynr"))
                            }, {
                                default: r( () => [k(" 整理课程重要内容 ")]),
                                _: 1
                            }, 8, ["disabled"])) : h("", !0), (Me = (ae = (te = I.value) == null ? void 0 : te.summarization) == null ? void 0 : ae.Summarization) != null && Me.QuestionsAnsweringSummary ? (m(),
                            w(n, {
                                key: 1,
                                size: "small",
                                disabled: !((Ve = _.value) != null && Ve.isReply),
                                type: "warning",
                                ghost: "",
                                onClick: t[1] || (t[1] = F => Se("zlzywt"))
                            }, {
                                default: r( () => [k(" 整理重要问题 ")]),
                                _: 1
                            }, 8, ["disabled"])) : h("", !0), (Fe = (Le = (Ae = I.value) == null ? void 0 : Ae.meetingAssistance) == null ? void 0 : Le.MeetingAssistance) != null && Fe.Keywords ? (m(),
                            w(n, {
                                key: 2,
                                size: "small",
                                disabled: !((Ee = _.value) != null && Ee.isReply),
                                type: "error",
                                ghost: "",
                                onClick: t[2] || (t[2] = F => Se("zlgjz"))
                            }, {
                                default: r( () => [k(" 整理关键词 ")]),
                                _: 1
                            }, 8, ["disabled"])) : h("", !0)])) : h("", !0), g("div", Ht, [d(o, {
                                disabled: !((De = _.value) != null && De.isReply),
                                placeholder: "输入课程中感兴趣的内容进行提问",
                                type: "textarea",
                                value: T.value,
                                "onUpdate:value": t[4] || (t[4] = F => T.value = F),
                                clearable: !1,
                                autosize: {
                                    minRows: 4
                                },
                                onKeydown: yt(Te(nt, ["prevent"]), ["enter"]),
                                class: "custom-input"
                            }, {
                                suffix: r( () => {
                                    var F;
                                    return [(F = _.value) != null && F.isReply ? (m(),
                                    z("img", {
                                        key: 0,
                                        src: E(Mt),
                                        class: "send-icon",
                                        onClick: Te(Ce, ["stop", "prevent"])
                                    }, null, 8, Xt)) : (m(),
                                    z("img", {
                                        key: 1,
                                        src: E(rt),
                                        class: "send-icon",
                                        onClick: t[3] || (t[3] = Te( () => {
                                            _.value.init()
                                        }
                                        , ["stop", "prevent"]))
                                    }, null, 8, Zt))]
                                }
                                ),
                                _: 1
                            }, 8, ["disabled", "value", "onKeydown"])])]
                        }
                        ),
                        _: 1
                    })) : h("", !0), x.value && C.value && C.value.length > 0 ? (m(),
                    w(s, {
                        key: 1,
                        name: "智能字幕",
                        tab: "智能字幕",
                        "display-directive": "show"
                    }, {
                        default: r( () => [d(At, {
                            currentTime: M.value,
                            list: C.value,
                            onSelectChange: _e
                        }, null, 8, ["currentTime", "list"])]),
                        _: 1
                    })) : h("", !0), x.value && Y.value && Y.value.length > 0 ? (m(),
                    w(s, {
                        key: 2,
                        name: "要点速览",
                        tab: "要点速览",
                        "display-directive": "show"
                    }, {
                        default: r( () => [d(Lt, {
                            list: Y.value,
                            onSelectChange: _e
                        }, null, 8, ["list"])]),
                        _: 1
                    })) : h("", !0), d(s, {
                        name: "课程笔记",
                        tab: "课程笔记",
                        "display-directive": "show",
                        disabled: c.value.length === 0 || !p.value[0] || !c.value
                    }, {
                        default: r( () => [d(R, {
                            vertical: ""
                        }, {
                            default: r( () => [d(o, {
                                value: P.value,
                                "onUpdate:value": t[5] || (t[5] = v => P.value = v),
                                type: "textarea",
                                rows: "8",
                                maxlength: "200",
                                "show-count": "",
                                placeholder: "请输入笔记内容"
                            }, null, 8, ["value"]), g("div", Rt, [g("div", ea, [d(y, {
                                checked: V.value,
                                "onUpdate:checked": t[6] || (t[6] = v => V.value = v),
                                onClick: He
                            }, {
                                default: r( () => [k(" 添加驻点 ")]),
                                _: 1
                            }, 8, ["checked"]), V.value ? (m(),
                            w(u, {
                                key: 0,
                                size: "small",
                                bordered: !1,
                                type: "warning"
                            }, {
                                default: r( () => [k(W(K($.value)), 1)]),
                                _: 1
                            })) : h("", !0)]), d(R, null, {
                                default: r( () => [x.value ? (m(),
                                w(n, {
                                    key: 0,
                                    disabled: M.value < 60,
                                    bordered: !1,
                                    class: "smart_btn",
                                    size: "small",
                                    type: "primary",
                                    onClick: Je
                                }, {
                                    default: r( () => [k(" 智能生成 "), d(q, {
                                        trigger: "hover"
                                    }, {
                                        trigger: r( () => [d(f, {
                                            size: "12"
                                        }, {
                                            default: r( () => [d(E(ut))]),
                                            _: 1
                                        })]),
                                        default: r( () => [k(" 为您自动抓取过去1分钟内的讲课内容 ")]),
                                        _: 1
                                    })]),
                                    _: 1
                                }, 8, ["disabled"])) : h("", !0), d(n, {
                                    size: "small",
                                    loading: ke.value,
                                    type: "primary",
                                    onClick: Ge
                                }, {
                                    default: r( () => [k("保存")]),
                                    _: 1
                                }, 8, ["loading"])]),
                                _: 1
                            })])]),
                            _: 1
                        }), g("div", ta, [d(de, {
                            trigger: "none"
                        }, {
                            default: r( () => [me.value.length ? (m(!0),
                            z(ht, {
                                key: 0
                            }, bt(me.value, (v, L) => (m(),
                            z("div", {
                                class: "videoNote_content",
                                key: L
                            }, [g("div", aa, [g("div", na, W(v.title), 1), v.point ? (m(),
                            z("div", {
                                key: 0,
                                class: "right",
                                onClick: Q => _e(v.point)
                            }, " 【视频 " + W(v.point) + "】 ", 9, ia)) : h("", !0)]), g("div", oa, W(v.content), 1)]))), 128)) : (m(),
                            w(ue, {
                                key: 1,
                                description: "您未记录笔记~"
                            }))]),
                            _: 1
                        })])]),
                        _: 1
                    }, 8, ["disabled"])]),
                    _: 1
                }, 8, ["value"]), E(Ie) == "1" || x.value ? (m(),
                z("p", la, "内容根据本课程素材由 AI生成，请仔细甄别")) : h("", !0)])]),
                "resize-trigger": r( () => [g("div", sa, [d(f, {
                    size: 16
                }, {
                    default: r( () => [d(E(Ft))]),
                    _: 1
                })])]),
                _: 1
            })])
        }
    }
});
const Ua = $t(ra, [["__scopeId", "data-v-f4b7c2fd"]]);
export {Ua as default};
