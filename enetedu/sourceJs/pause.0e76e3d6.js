import {c1 as Ue, a as ge, o as m, i as w, k as a, L as He, r as l, Q as ie, h as Ke, as as We, p as Xe, aT as ce, aU as ve, j as y, w as b, u as S, O as z, b6 as je, au as U, cv as H, c as K, y as L, F as de, l as fe, z as Q, ci as pe, K as me, R as qe, aj as Ge, A as Qe, B as Ye} from "./entry.19ee18d5.js";
import {H as C} from "./hls.07b9f711.js";
import {C as _e} from "./CaretForwardCircleOutline.254ef9f4.js";
import {P as Je, S as Ze, _ as et} from "./Scan.af71168e.js";
import {V as tt, a as at} from "./VolumeMuteOutline.442c6792.js";
import {_ as nt} from "./_plugin-vue_export-helper.c27b6911.js";
var lt = Ue.isFinite;
function Gt(d) {
    return typeof d == "number" && lt(d)
}
const ot = {
    xmlns: "http://www.w3.org/2000/svg",
    "xmlns:xlink": "http://www.w3.org/1999/xlink",
    viewBox: "0 0 512 512"
}
  , ut = a("path", {
    d: "M248 64C146.39 64 64 146.39 64 248s82.39 184 184 184s184-82.39 184-184S349.61 64 248 64z",
    fill: "none",
    stroke: "currentColor",
    "stroke-miterlimit": "10",
    "stroke-width": "32"
}, null, -1)
  , st = a("path", {
    fill: "none",
    stroke: "currentColor",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": "32",
    d: "M220 220h32v116"
}, null, -1)
  , rt = a("path", {
    fill: "none",
    stroke: "currentColor",
    "stroke-linecap": "round",
    "stroke-miterlimit": "10",
    "stroke-width": "32",
    d: "M208 340h88"
}, null, -1)
  , it = a("path", {
    d: "M248 130a26 26 0 1 0 26 26a26 26 0 0 0-26-26z",
    fill: "currentColor"
}, null, -1)
  , ct = [ut, st, rt, it]
  , Qt = ge({
    name: "InformationCircleOutline",
    render: function(Y, i) {
        return m(),
        w("svg", ot, ct)
    }
})
  , P = d => (Qe("data-v-fb115df1"),
d = d(),
Ye(),
d)
  , vt = ["src"]
  , dt = ["onClick"]
  , ft = {
    key: 0,
    class: "play-button"
}
  , pt = {
    class: "custom-controls"
}
  , mt = {
    class: "progress-bar"
}
  , _t = {
    class: "control-buttons"
}
  , gt = {
    style: {
        display: "flex",
        "align-items": "center",
        gap: "5px"
    }
}
  , ht = ["onClick"]
  , yt = {
    class: "time-display"
}
  , kt = {
    style: {
        display: "flex",
        "align-items": "center",
        gap: "10px"
    }
}
  , bt = {
    class: "volume-control"
}
  , wt = {
    class: "control-button rate-button"
}
  , xt = {
    class: "rate-options"
}
  , Tt = ["onClick"]
  , Ct = {
    class: "control-button rate-button"
}
  , Et = {
    class: "rate-options"
}
  , St = ["onClick"]
  , Lt = ["onClick"]
  , Mt = {
    key: 0,
    class: "end-controls"
}
  , Rt = P( () => a("span", null, "重新观看", -1))
  , Ft = [Rt]
  , Dt = P( () => a("span", null, "下一部", -1))
  , Pt = [Dt]
  , $t = {
    key: 1,
    class: "loading-overlay"
}
  , It = P( () => a("div", {
    class: "loading-spinner"
}, null, -1))
  , Bt = P( () => a("div", {
    class: "loading-text"
}, "加载中...", -1))
  , Ot = [It, Bt]
  , Vt = {
    key: 2,
    class: "no-video-overlay"
}
  , Nt = P( () => a("div", {
    class: "no-video-content"
}, [a("div", {
    class: "no-video-text"
}, "无视频资源")], -1))
  , At = [Nt]
  , zt = ge({
    __name: "index",
    props: {
        isDrag: {
            type: Boolean,
            required: !1,
            default: !1
        },
        transcodeOutputs: {
            type: Array,
            default: () => []
        },
        currentTranscodeIndex: {
            type: Number,
            default: 0
        }
    },
    emits: ["play", "pause", "ended", "next", "max-time-update", "inactive", "timeUpdate", "Drag", "transcodeIndex"],
    setup(d, {expose: Y, emit: i}) {
        const W = d
          , J = He()
          , t = l(null)
          , X = l("")
          , x = l(!1)
          , f = l(!1)
          , h = l(!1)
          , M = l(!1)
          , _ = l(!1)
          , c = l(0)
          , $ = l()
          , v = l(!1)
          , R = l(!1)
          , T = l(1)
          , I = l(0)
          , g = l(0)
          , Z = l(0)
          , B = l(!1)
          , j = l(!1)
          , k = l(1)
          , F = l(null)
          , r = l(null)
          , he = l({
            " ": "togglePlay",
            ArrowLeft: "seekBackward",
            ArrowRight: "seekForward",
            k: "togglePlay",
            K: "togglePlay",
            f: "toggleFullscreen",
            F: "toggleFullscreen",
            m: "toggleMute",
            M: "toggleMute"
        })
          , E = l(!1)
          , ee = l(0)
          , te = l(0);
        ie(X, e => {
            e || (_.value = !0,
            D())
        }
        ),
        Ke( () => {
            const e = t.value;
            e && (e.defaultPlaybackRate = 1,
            e.playbackRate = 1,
            e.addEventListener("ratechange", () => {
                e.playbackRate !== k.value && (e.playbackRate = k.value)
            }
            ),
            ke(),
            document.addEventListener("fullscreenchange", oe),
            document.addEventListener("keydown", ae))
        }
        ),
        We( () => {
            F.value && clearTimeout(F.value),
            D(),
            document.removeEventListener("fullscreenchange", oe),
            document.removeEventListener("keydown", ae),
            q()
        }
        );
        function ae(e) {
            if (e.target.tagName === "INPUT")
                return;
            const n = he.value[e.key];
            if (n)
                switch (e.preventDefault(),
                n) {
                case "togglePlay":
                    N();
                    break;
                case "seekBackward":
                    ne(-5);
                    break;
                case "seekForward":
                    ne(5);
                    break;
                case "toggleFullscreen":
                    se();
                    break;
                case "toggleMute":
                    ue();
                    break
                }
        }
        function ne(e) {
            if (!t.value)
                return;
            const n = t.value.currentTime + e
              , s = Math.max(0, Math.min(n, g.value))
              , o = W.isDrag || s <= c.value ? s : c.value;
            t.value.currentTime = o,
            i("Drag", o)
        }
        function ye(e) {
            t.value && (E.value = !0,
            ee.value = e.clientX,
            te.value = t.value.currentTime,
            document.addEventListener("mousemove", le),
            document.addEventListener("mouseup", q))
        }
        function le(e) {
            var u;
            if (!E.value || !t.value)
                return;
            (u = $.value) == null || u.classList.add("dragging");
            const n = e.clientX - ee.value
              , s = .5
              , p = n / window.innerWidth * g.value * s;
            let o = te.value + p;
            o = Math.max(0, Math.min(o, g.value)),
            (o <= c.value || W.isDrag) && (t.value.currentTime = o,
            i("Drag", o))
        }
        function q() {
            var e;
            E.value && ((e = $.value) == null || e.classList.remove("dragging")),
            E.value = !1,
            document.removeEventListener("mousemove", le),
            document.removeEventListener("mouseup", q)
        }
        function oe() {
            j.value = !!document.fullscreenElement
        }
        function ke() {
            O(),
            document.addEventListener("mousemove", O),
            document.addEventListener("keydown", O),
            document.addEventListener("click", O)
        }
        function O() {
            F.value && clearTimeout(F.value),
            F.value = setTimeout( () => {
                i("inactive")
            }
            , 5 * 60 * 1e3)
        }
        const V = [1.25, 1, .75, .5];
        function be(e) {
            !t.value || !V.includes(e) || (k.value = e,
            t.value.playbackRate = e,
            J.info(`播放速度: ${e}x`, {
                duration: 1e3
            }))
        }
        ie(k, e => {
            V.includes(e) || (k.value = 1,
            t.value && (t.value.playbackRate = 1))
        }
        );
        function we(e) {
            const n = t.value;
            n && n.currentTime > c.value && !W.isDrag && (n.currentTime = c.value)
        }
        function G() {
            const e = t.value;
            e && (I.value = e.currentTime || 0,
            i("timeUpdate", e.currentTime || 0),
            !pe(e.duration) && e.duration > 0 && (g.value = e.duration),
            e.buffered.length > 0 && (Z.value = e.buffered.end(e.buffered.length - 1)),
            e.currentTime > c.value && (c.value = e.currentTime))
        }
        function xe(e, n) {
            t.value && (t.value.currentTime = e || 0,
            n !== void 0 ? c.value = n : c.value = e > c.value ? e : c.value)
        }
        function Te(e) {
            if (!e) {
                _.value = !0,
                f.value = !1,
                D();
                return
            }
            _.value = !1,
            M.value = !1,
            f.value = !0,
            x.value = !1,
            D(),
            f.value = !0,
            x.value = !1,
            me( () => {
                const n = t.value;
                n && C.isSupported() && e.includes(".m3u8") && (r.value = new C({
                    enableWorker: !0,
                    lowLatencyMode: !0,
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60,
                    maxBufferSize: 60 * 1e3 * 1e3,
                    maxBufferHole: .5
                }),
                r.value.loadSource(e),
                r.value.attachMedia(n),
                r.value.on(C.Events.MANIFEST_PARSED, () => {
                    f.value = !1,
                    G()
                }
                ),
                r.value.on(C.Events.LEVEL_LOADED, (s, p) => {
                    g.value = p.details.totalduration
                }
                ),
                r.value.on(C.Events.ERROR, (s, p) => {
                    var o;
                    p.type === C.ErrorTypes.NETWORK_ERROR && p.details === C.ErrorDetails.KEY_LOAD_ERROR && ((o = r.value) == null || o.startLoad())
                }
                ),
                r.value.on(C.Events.FRAG_LOADED, () => {
                    h.value = !1
                }
                ))
            }
            )
        }
        function D() {
            r.value && (r.value.detachMedia(),
            r.value.destroy(),
            r.value = null),
            v.value = !1,
            h.value = !1
        }
        function Ce(e) {
            f.value = !0,
            M.value = !1,
            x.value = !1,
            _.value = !e,
            X.value = e,
            e ? me( () => {
                t.value && (t.value.src = e),
                Te(e)
            }
            ) : (f.value = !1,
            D())
        }
        function Ee(e) {
            V.includes(k.value) || (k.value = 1,
            t.value && (t.value.playbackRate = 1)),
            v.value = !0,
            x.value = !1,
            h.value = !1,
            i("play", e)
        }
        function Se(e) {
            v.value = !1,
            i("pause", e)
        }
        function Le(e) {
            v.value = !1,
            x.value = !0,
            i("ended", e)
        }
        function Me() {
            h.value = !0,
            v.value = !1,
            i("pause", null)
        }
        function Re() {
            h.value = !1,
            t.value && !t.value.paused && (v.value = !0,
            i("play", null))
        }
        function Fe() {
            _.value || (f.value = !0,
            M.value = !1,
            v.value = !1,
            i("pause", null))
        }
        function De() {
            f.value = !1,
            M.value = !1,
            t.value && !t.value.paused && (v.value = !0,
            i("play", null))
        }
        function Pe() {
            _.value || (M.value = !0,
            f.value = !1,
            h.value = !1,
            v.value = !1,
            _.value = !0)
        }
        function $e() {
            t.value && (t.value.currentTime = 0,
            r.value ? r.value.play().catch(console.error) : t.value.play().catch(console.error),
            x.value = !1,
            v.value = !0)
        }
        function Ie() {
            x.value = !1,
            i("next")
        }
        function N() {
            const e = t.value;
            !e || _.value || (e.paused ? e.play().catch(n => {
                console.error("播放失败:", n),
                n.name === "NotAllowedError" && J.warning("请点击页面任意位置后重试")
            }
            ) : e.pause())
        }
        function Be() {
            const e = t.value;
            !e || _.value || e.pause()
        }
        const ue = () => {
            if (t.value)
                if (R.value || T.value === 0) {
                    R.value = !1;
                    const e = T.value === 0 ? .7 : T.value;
                    t.value.muted = !1,
                    t.value.volume = e,
                    T.value = e
                } else
                    R.value = !0,
                    t.value.muted = !0,
                    T.value = 0
        }
          , Oe = e => {
            t.value && (T.value = e,
            R.value = e === 0,
            t.value.volume = e,
            t.value.muted = e === 0)
        }
        ;
        function se() {
            t.value && (document.fullscreenElement ? document.exitFullscreen() : $.value.requestFullscreen().catch(e => {
                console.error("全屏错误:", e),
                j.value = !1
            }
            ))
        }
        function Ve(e) {
            if (E.value) {
                E.value = !1;
                return
            }
            if (!t.value)
                return;
            const s = e.currentTarget.getBoundingClientRect()
              , o = (e.clientX - s.left) / s.width * g.value;
            o <= c.value && (t.value.currentTime = o,
            v.value || r.value.startLoad(),
            i("Drag", o))
        }
        function Ne() {
            var e, n;
            return ((e = r.value) == null ? void 0 : e.currentTime) || ((n = t.value) == null ? void 0 : n.currentTime) || 0
        }
        function Ae() {
            return c.value
        }
        function re(e) {
            if (pe(e))
                return "00:00";
            const n = Math.floor(e / 3600)
              , s = Math.floor(e % 3600 / 60)
              , p = Math.floor(e % 60);
            return n > 0 ? `${n.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${p.toString().padStart(2, "0")}` : `${s.toString().padStart(2, "0")}:${p.toString().padStart(2, "0")}`
        }
        function ze(e) {
            i("transcodeIndex", e)
        }
        return Y({
            pauseVideo: Be,
            setVideoSrc: Ce,
            setStartTime: xe,
            getPlaytime: Ne,
            getMaxPlaytime: Ae,
            isLoading: () => f.value,
            isBuffering: () => h.value
        }),
        (e, n) => {
            const s = qe
              , p = et
              , o = Ge;
            return m(),
            w("div", {
                class: Q(["videoPlayer_box", {
                    fullscreen: j.value
                }]),
                ref_key: "videoPlayer_boxRef",
                ref: $,
                onMousemove: n[1] || (n[1] = u => B.value = !0),
                onMouseleave: n[2] || (n[2] = u => B.value = !1)
            }, [a("video", {
                ref_key: "videoPlayerRef",
                ref: t,
                "x-webkit-airplay": "allow",
                "webkit-playsinline": "",
                playsinline: "",
                disablepictureinpicture: "",
                style: {
                    cursor: "pointer"
                },
                preload: "metadata",
                class: "videoContainer",
                onSeeking: we,
                onTimeupdate: G,
                onDurationchange: G,
                onPlay: Ee,
                onPause: Se,
                onEnded: Le,
                onLoadstart: Fe,
                onLoadeddata: De,
                onWaiting: Me,
                onCanplay: Re,
                onError: Pe,
                onClick: N,
                oncontextmenu: "return false;",
                controlslist: "nodownload noremoteplayback noplaybackrate"
            }, [a("source", {
                src: X.value,
                type: "video/mp4"
            }, null, 8, vt), Xe(" 您当前的浏览器不支持该控件，请升级浏览器！ ")], 544), ce(a("div", {
                class: "center-control",
                onClick: U(N, ["stop"])
            }, [y(je, {
                name: "scale-fade"
            }, {
                default: b( () => [v.value ? z("", !0) : (m(),
                w("div", ft, [y(s, {
                    size: "80",
                    color: "#999"
                }, {
                    default: b( () => [y(S(_e))]),
                    _: 1
                })]))]),
                _: 1
            })], 8, dt), [[ve, (!v.value || B.value) && !h.value && !f.value]]), ce(a("div", pt, [a("div", {
                class: "progress-container",
                onMousedown: ye,
                onClick: Ve
            }, [a("div", mt, [a("div", {
                class: "buffered-progress",
                style: H({
                    width: `${Z.value / g.value * 100}%`
                })
            }, null, 4), a("div", {
                class: "watched-progress",
                style: H({
                    width: `${c.value / g.value * 100}%`
                })
            }, null, 4), a("div", {
                class: "current-progress",
                style: H({
                    width: `${I.value / g.value * 100}%`
                })
            }, null, 4), a("div", {
                class: "progress-thumb",
                style: H({
                    left: `${I.value / g.value * 100}%`
                })
            }, null, 4)])], 32), a("div", _t, [a("div", gt, [a("button", {
                onClick: U(N, ["stop"]),
                class: "control-button"
            }, [y(s, {
                size: "24",
                color: "#FFF",
                style: {
                    cursor: "pointer"
                }
            }, {
                default: b( () => [v.value ? (m(),
                K(S(Je), {
                    key: 0
                })) : (m(),
                K(S(_e), {
                    key: 1
                }))]),
                _: 1
            })], 8, ht), a("div", yt, L(re(I.value)) + " / " + L(re(g.value)), 1)]), a("div", kt, [a("div", bt, [y(s, {
                size: "24",
                color: "#FFF",
                class: "volume-sound",
                onClick: U(ue, ["stop"])
            }, {
                default: b( () => [R.value ? (m(),
                K(S(at), {
                    key: 1
                })) : (m(),
                K(S(tt), {
                    key: 0
                }))]),
                _: 1
            }, 8, ["onClick"]), y(p, {
                value: T.value,
                "onUpdate:value": [n[0] || (n[0] = u => T.value = u), Oe],
                tooltip: !1,
                min: 0,
                max: 1,
                step: .1,
                style: {
                    width: "100px"
                }
            }, null, 8, ["value"])]), y(o, {
                trigger: "hover",
                placement: "top",
                duration: 500
            }, {
                trigger: b( () => {
                    var u;
                    return [a("button", wt, [a("span", null, L((u = d.transcodeOutputs[d.currentTranscodeIndex]) == null ? void 0 : u.activityName), 1)])]
                }
                ),
                default: b( () => [a("div", xt, [(m(!0),
                w(de, null, fe(d.transcodeOutputs, (u, A) => (m(),
                w("button", {
                    key: A,
                    onClick: Ut => ze(A),
                    class: Q({
                        active: d.currentTranscodeIndex === A
                    })
                }, L(u == null ? void 0 : u.activityName), 11, Tt))), 128))])]),
                _: 1
            }), y(o, {
                trigger: "hover",
                placement: "top",
                duration: 500
            }, {
                trigger: b( () => [a("button", Ct, [a("span", null, L(k.value) + "x", 1)])]),
                default: b( () => [a("div", Et, [(m(),
                w(de, null, fe(V, u => a("button", {
                    key: u,
                    onClick: A => be(u),
                    class: Q({
                        active: k.value === u
                    })
                }, L(u) + "x ", 11, St)), 64))])]),
                _: 1
            }), a("button", {
                onClick: U(se, ["stop"]),
                class: "control-button"
            }, [y(s, {
                size: "24",
                color: "#FFF",
                style: {
                    cursor: "pointer"
                }
            }, {
                default: b( () => [y(S(Ze))]),
                _: 1
            })], 8, Lt)])])], 512), [[ve, B.value || h.value || f.value]]), x.value ? (m(),
            w("div", Mt, [a("button", {
                onClick: $e,
                class: "control-button replay-button"
            }, Ft), a("button", {
                onClick: Ie,
                class: "control-button next-button"
            }, Pt)])) : z("", !0), (f.value || h.value) && !_.value ? (m(),
            w("div", $t, Ot)) : z("", !0), _.value ? (m(),
            w("div", Vt, At)) : z("", !0)], 34)
        }
    }
});
const Yt = nt(zt, [["__scopeId", "data-v-fb115df1"]])
  , Jt = "" + new URL("pause.71dec6e1.png",import.meta.url).href;
export {Qt as I, Yt as _, Gt as i, Jt as p};
