const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/vendor-katex-1qM3YPdw.js","assets/rolldown-runtime-CMxvf4Kt.js","assets/vendor-katex-CI_pfXFy.css"])))=>i.map(i=>d[i]);
import { n as e } from "./rolldown-runtime-CMxvf4Kt.js";
import { n as t, t as n } from "./chunk-Y2CYZVJY-DsF7k-Jl.js";
import { n as r, t as i } from "./chunk-X3CZISLH-BnlqbmGY.js";
let F, Bn, _r, xn, Tt, tn, Un, hr, cr, sn, Jn, ur, qt, Pn, xr, jn, yn, en, Kt, Sr, fn, or, $t, nn, $n, vr, W, pn, ar, E, rn, qn, l, gr, P, Ut, Yt, mn, Vn, A, Z, dn, Xn, _n, on, M, er, ut, vn, Qt, z, j, Wn, c, gn, N, Jt, lr, dr, mr, sr, $;
let __tla = (async ()=>{
    let a, o, s;
    l = e((()=>{
        a = `modulepreload`, o = function(e) {
            return `/NYX/` + e;
        }, s = {}, c = function(e, t, n) {
            let r = Promise.resolve();
            if (t && t.length > 0) {
                let e = document.getElementsByTagName(`link`), i = document.querySelector(`meta[property=csp-nonce]`), c = i?.nonce || i?.getAttribute(`nonce`);
                function l(e) {
                    return Promise.all(e.map((e)=>Promise.resolve(e).then((e)=>({
                                status: `fulfilled`,
                                value: e
                            }), (e)=>({
                                status: `rejected`,
                                reason: e
                            }))));
                }
                r = l(t.map((t)=>{
                    if (t = o(t, n), t in s) return;
                    s[t] = !0;
                    let r = t.endsWith(`.css`), i = r ? `[rel="stylesheet"]` : ``;
                    if (n) for(let n = e.length - 1; n >= 0; n--){
                        let i = e[n];
                        if (i.href === t && (!r || i.rel === `stylesheet`)) return;
                    }
                    else if (document.querySelector(`link[href="${t}"]${i}`)) return;
                    let l = document.createElement(`link`);
                    if (l.rel = r ? `stylesheet` : a, r || (l.as = `script`), l.crossOrigin = ``, l.href = t, c && l.setAttribute(`nonce`, c), document.head.appendChild(l), r) return new Promise((e, n)=>{
                        l.addEventListener(`load`, e), l.addEventListener(`error`, ()=>n(Error(`Unable to preload CSS for ${t}`)));
                    });
                }));
            }
            function i(e) {
                let t = new Event(`vite:preloadError`, {
                    cancelable: !0
                });
                if (t.payload = e, window.dispatchEvent(t), !t.defaultPrevented) throw e;
            }
            return r.then((t)=>{
                for (let e of t || [])e.status === `rejected` && i(e.reason);
                return e().catch(i);
            });
        };
    }));
    function u(e, t) {
        (t == null || t > e.length) && (t = e.length);
        for(var n = 0, r = Array(t); n < t; n++)r[n] = e[n];
        return r;
    }
    function d(e) {
        if (Array.isArray(e)) return e;
    }
    function ee(e, t) {
        var n = e == null ? null : typeof Symbol < `u` && e[Symbol.iterator] || e[`@@iterator`];
        if (n != null) {
            var r, i, a, o, s = [], c = !0, l = !1;
            try {
                if (a = (n = n.call(e)).next, t !== 0) for(; !(c = (r = a.call(n)).done) && (s.push(r.value), s.length !== t); c = !0);
            } catch (e) {
                l = !0, i = e;
            } finally{
                try {
                    if (!c && n.return != null && (o = n.return(), Object(o) !== o)) return;
                } finally{
                    if (l) throw i;
                }
            }
            return s;
        }
    }
    function te() {
        throw TypeError(`Invalid attempt to destructure non-iterable instance.
In order to be iterable, non-array objects must have a [Symbol.iterator]() method.`);
    }
    function ne(e, t) {
        return d(e) || ee(e, t) || f(e, t) || te();
    }
    function f(e, t) {
        if (e) {
            if (typeof e == `string`) return u(e, t);
            var n = {}.toString.call(e).slice(8, -1);
            return n === `Object` && e.constructor && (n = e.constructor.name), n === `Map` || n === `Set` ? Array.from(e) : n === `Arguments` || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n) ? u(e, t) : void 0;
        }
    }
    var re = Object.entries, p = Object.setPrototypeOf, ie = Object.isFrozen, ae = Object.getPrototypeOf, m = Object.getOwnPropertyDescriptor, h = Object.freeze, g = Object.seal, oe = Object.create, se = typeof Reflect < `u` && Reflect, ce = se.apply, le = se.construct;
    h ||= function(e) {
        return e;
    }, g ||= function(e) {
        return e;
    }, ce ||= function(e, t) {
        var n = [
            ...arguments
        ].slice(2);
        return e.apply(t, n);
    }, le ||= function(e) {
        return new e(...[
            ...arguments
        ].slice(1));
    };
    var ue = x(Array.prototype.forEach), de = x(Array.prototype.lastIndexOf), fe = x(Array.prototype.pop), pe = x(Array.prototype.push), me = x(Array.prototype.splice), he = Array.isArray, ge = x(String.prototype.toLowerCase), _e = x(String.prototype.toString), ve = x(String.prototype.match), ye = x(String.prototype.replace), be = x(String.prototype.indexOf), xe = x(String.prototype.trim), Se = x(Number.prototype.toString), _ = x(Boolean.prototype.toString), v = typeof BigInt > `u` ? null : x(BigInt.prototype.toString), Ce = typeof Symbol > `u` ? null : x(Symbol.prototype.toString), y = x(Object.prototype.hasOwnProperty), we = x(Object.prototype.toString), b = x(RegExp.prototype.test), Te = Ee(TypeError);
    function x(e) {
        return function(t) {
            t instanceof RegExp && (t.lastIndex = 0);
            var n = [
                ...arguments
            ].slice(1);
            return ce(e, t, n);
        };
    }
    function Ee(e) {
        return function() {
            return le(e, [
                ...arguments
            ]);
        };
    }
    function S(e, t) {
        let n = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : ge;
        if (p && p(e, null), !he(t)) return e;
        let r = t.length;
        for(; r--;){
            let i = t[r];
            if (typeof i == `string`) {
                let e = n(i);
                e !== i && (ie(t) || (t[r] = e), i = e);
            }
            e[i] = !0;
        }
        return e;
    }
    function De(e) {
        for(let t = 0; t < e.length; t++)y(e, t) || (e[t] = null);
        return e;
    }
    function C(e) {
        let t = oe(null);
        for (let r of re(e)){
            var n = ne(r, 2);
            let i = n[0], a = n[1];
            y(e, i) && (he(a) ? t[i] = De(a) : a && typeof a == `object` && a.constructor === Object ? t[i] = C(a) : t[i] = a);
        }
        return t;
    }
    function Oe(e) {
        switch(typeof e){
            case `string`:
                return e;
            case `number`:
                return Se(e);
            case `boolean`:
                return _(e);
            case `bigint`:
                return v ? v(e) : `0`;
            case `symbol`:
                return Ce ? Ce(e) : `Symbol()`;
            case `undefined`:
                return we(e);
            case `function`:
            case `object`:
                {
                    if (e === null) return we(e);
                    let t = e, n = w(t, `toString`);
                    if (typeof n == `function`) {
                        let e = n(t);
                        return typeof e == `string` ? e : we(e);
                    }
                    return we(e);
                }
            default:
                return we(e);
        }
    }
    function w(e, t) {
        for(; e !== null;){
            let n = m(e, t);
            if (n) {
                if (n.get) return x(n.get);
                if (typeof n.value == `function`) return x(n.value);
            }
            e = ae(e);
        }
        function n() {
            return null;
        }
        return n;
    }
    function ke(e) {
        try {
            return b(e, ``), !0;
        } catch  {
            return !1;
        }
    }
    var Ae = h(`a.abbr.acronym.address.area.article.aside.audio.b.bdi.bdo.big.blink.blockquote.body.br.button.canvas.caption.center.cite.code.col.colgroup.content.data.datalist.dd.decorator.del.details.dfn.dialog.dir.div.dl.dt.element.em.fieldset.figcaption.figure.font.footer.form.h1.h2.h3.h4.h5.h6.head.header.hgroup.hr.html.i.img.input.ins.kbd.label.legend.li.main.map.mark.marquee.menu.menuitem.meter.nav.nobr.ol.optgroup.option.output.p.picture.pre.progress.q.rp.rt.ruby.s.samp.search.section.select.shadow.slot.small.source.spacer.span.strike.strong.style.sub.summary.sup.table.tbody.td.template.textarea.tfoot.th.thead.time.tr.track.tt.u.ul.var.video.wbr`.split(`.`)), je = h(`svg.a.altglyph.altglyphdef.altglyphitem.animatecolor.animatemotion.animatetransform.circle.clippath.defs.desc.ellipse.enterkeyhint.exportparts.filter.font.g.glyph.glyphref.hkern.image.inputmode.line.lineargradient.marker.mask.metadata.mpath.part.path.pattern.polygon.polyline.radialgradient.rect.stop.style.switch.symbol.text.textpath.title.tref.tspan.view.vkern`.split(`.`)), Me = h([
        `feBlend`,
        `feColorMatrix`,
        `feComponentTransfer`,
        `feComposite`,
        `feConvolveMatrix`,
        `feDiffuseLighting`,
        `feDisplacementMap`,
        `feDistantLight`,
        `feDropShadow`,
        `feFlood`,
        `feFuncA`,
        `feFuncB`,
        `feFuncG`,
        `feFuncR`,
        `feGaussianBlur`,
        `feImage`,
        `feMerge`,
        `feMergeNode`,
        `feMorphology`,
        `feOffset`,
        `fePointLight`,
        `feSpecularLighting`,
        `feSpotLight`,
        `feTile`,
        `feTurbulence`
    ]), Ne = h([
        `animate`,
        `color-profile`,
        `cursor`,
        `discard`,
        `font-face`,
        `font-face-format`,
        `font-face-name`,
        `font-face-src`,
        `font-face-uri`,
        `foreignobject`,
        `hatch`,
        `hatchpath`,
        `mesh`,
        `meshgradient`,
        `meshpatch`,
        `meshrow`,
        `missing-glyph`,
        `script`,
        `set`,
        `solidcolor`,
        `unknown`,
        `use`
    ]), Pe = h(`math.menclose.merror.mfenced.mfrac.mglyph.mi.mlabeledtr.mmultiscripts.mn.mo.mover.mpadded.mphantom.mroot.mrow.ms.mspace.msqrt.mstyle.msub.msup.msubsup.mtable.mtd.mtext.mtr.munder.munderover.mprescripts`.split(`.`)), Fe = h([
        `maction`,
        `maligngroup`,
        `malignmark`,
        `mlongdiv`,
        `mscarries`,
        `mscarry`,
        `msgroup`,
        `mstack`,
        `msline`,
        `msrow`,
        `semantics`,
        `annotation`,
        `annotation-xml`,
        `mprescripts`,
        `none`
    ]), Ie = h([
        `#text`
    ]), Le = h(`accept.action.align.alt.autocapitalize.autocomplete.autopictureinpicture.autoplay.background.bgcolor.border.capture.cellpadding.cellspacing.checked.cite.class.clear.color.cols.colspan.command.commandfor.controls.controlslist.coords.crossorigin.datetime.decoding.default.dir.disabled.disablepictureinpicture.disableremoteplayback.download.draggable.enctype.enterkeyhint.exportparts.face.for.headers.height.hidden.high.href.hreflang.id.inert.inputmode.integrity.ismap.kind.label.lang.list.loading.loop.low.max.maxlength.media.method.min.minlength.multiple.muted.name.nonce.noshade.novalidate.nowrap.open.optimum.part.pattern.placeholder.playsinline.popover.popovertarget.popovertargetaction.poster.preload.pubdate.radiogroup.readonly.rel.required.rev.reversed.role.rows.rowspan.spellcheck.scope.selected.shape.size.sizes.slot.span.srclang.start.src.srcset.step.style.summary.tabindex.title.translate.type.usemap.valign.value.width.wrap.xmlns`.split(`.`)), Re = h(`accent-height.accumulate.additive.alignment-baseline.amplitude.ascent.attributename.attributetype.azimuth.basefrequency.baseline-shift.begin.bias.by.class.clip.clippathunits.clip-path.clip-rule.color.color-interpolation.color-interpolation-filters.color-profile.color-rendering.cx.cy.d.dx.dy.diffuseconstant.direction.display.divisor.dominant-baseline.dur.edgemode.elevation.end.exponent.fill.fill-opacity.fill-rule.filter.filterunits.flood-color.flood-opacity.font-family.font-size.font-size-adjust.font-stretch.font-style.font-variant.font-weight.fx.fy.g1.g2.glyph-name.glyphref.gradientunits.gradienttransform.height.href.id.image-rendering.in.in2.intercept.k.k1.k2.k3.k4.kerning.keypoints.keysplines.keytimes.lang.lengthadjust.letter-spacing.kernelmatrix.kernelunitlength.lighting-color.local.marker-end.marker-mid.marker-start.markerheight.markerunits.markerwidth.maskcontentunits.maskunits.max.mask.mask-type.media.method.mode.min.name.numoctaves.offset.operator.opacity.order.orient.orientation.origin.overflow.paint-order.path.pathlength.patterncontentunits.patterntransform.patternunits.pointer-events.points.preservealpha.preserveaspectratio.primitiveunits.r.rx.ry.radius.refx.refy.repeatcount.repeatdur.restart.result.rotate.scale.seed.shape-rendering.slope.specularconstant.specularexponent.spreadmethod.startoffset.stddeviation.stitchtiles.stop-color.stop-opacity.stroke-dasharray.stroke-dashoffset.stroke-linecap.stroke-linejoin.stroke-miterlimit.stroke-opacity.stroke.stroke-width.style.surfacescale.systemlanguage.tabindex.tablevalues.targetx.targety.transform.transform-origin.text-anchor.text-decoration.text-orientation.text-rendering.textlength.type.u1.u2.unicode.values.vector-effect.viewbox.visibility.version.vert-adv-y.vert-origin-x.vert-origin-y.width.word-spacing.wrap.writing-mode.xchannelselector.ychannelselector.x.x1.x2.xmlns.y.y1.y2.z.zoomandpan`.split(`.`)), ze = h(`accent.accentunder.align.bevelled.close.columnalign.columnlines.columnspacing.columnspan.denomalign.depth.dir.display.displaystyle.encoding.fence.frame.height.href.id.largeop.length.linethickness.lquote.lspace.mathbackground.mathcolor.mathsize.mathvariant.maxsize.minsize.movablelimits.notation.numalign.open.rowalign.rowlines.rowspacing.rowspan.rspace.rquote.scriptlevel.scriptminsize.scriptsizemultiplier.selection.separator.separators.stretchy.subscriptshift.supscriptshift.symmetric.voffset.width.xmlns`.split(`.`)), Be = h([
        `xlink:href`,
        `xml:id`,
        `xlink:title`,
        `xml:space`,
        `xmlns:xlink`
    ]), Ve = g(/{{[\w\W]*|^[\w\W]*}}/g), He = g(/<%[\w\W]*|^[\w\W]*%>/g), Ue = g(/\${[\w\W]*/g), We = g(/^data-[\-\w.\u00B7-\uFFFF]+$/), Ge = g(/^aria-[\-\w]+$/), Ke = g(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i), qe = g(/^(?:\w+script|data):/i), Je = g(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g), Ye = g(/^html$/i), Xe = g(/^[a-z][.\w]*(-[.\w]+)+$/i), Ze = g(/<[/\w!]/g), Qe = g(/<[/\w]/g), $e = g(/<\/no(script|embed|frames)/i), et = g(/\/>/i), T = {
        element: 1,
        attribute: 2,
        text: 3,
        cdataSection: 4,
        entityReference: 5,
        entityNode: 6,
        processingInstruction: 7,
        comment: 8,
        document: 9,
        documentType: 10,
        documentFragment: 11,
        notation: 12
    }, tt = [
        `style`,
        `script`,
        `xmp`,
        `iframe`,
        `noembed`,
        `noframes`,
        `plaintext`,
        `noscript`
    ], nt = h(S({}, tt)), rt = function() {
        let e = {};
        return ue(tt, (t)=>{
            e[t] = g(RegExp(`</` + t + `(?=[\\t\\n\\f\\r />])`, `i`));
        }), h(e);
    }(), it = function() {
        return typeof window > `u` ? null : window;
    }, at = function(e, t) {
        if (typeof e != `object` || typeof e.createPolicy != `function`) return null;
        let n = null, r = `data-tt-policy-suffix`;
        t && t.hasAttribute(r) && (n = t.getAttribute(r));
        let i = `dompurify` + (n ? `#` + n : ``);
        try {
            return e.createPolicy(i, {
                createHTML (e) {
                    return e;
                },
                createScriptURL (e) {
                    return e;
                }
            });
        } catch  {
            return console.warn(`TrustedTypes policy ` + i + ` could not be created.`), null;
        }
    }, ot = function() {
        return {
            afterSanitizeAttributes: [],
            afterSanitizeElements: [],
            afterSanitizeShadowDOM: [],
            beforeSanitizeAttributes: [],
            beforeSanitizeElements: [],
            beforeSanitizeShadowDOM: [],
            uponSanitizeAttribute: [],
            uponSanitizeElement: [],
            uponSanitizeShadowNode: []
        };
    }, st = function(e, t, n, r) {
        return y(e, t) && he(e[t]) ? S(r.base ? C(r.base) : {}, e[t], r.transform) : n;
    }, ct = function(e, t, n) {
        let r = y(e, t) ? e[t] : void 0;
        return r && typeof r == `object` ? C(r) : n();
    };
    function lt() {
        let e = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : it(), t = (e)=>lt(e);
        if (t.version = `3.4.14`, t.removed = [], !e || !e.document || e.document.nodeType !== T.document || !e.Element) return t.isSupported = !1, t;
        let n = e.document, r = n, i = r.currentScript;
        e.DocumentFragment;
        let a = e.HTMLTemplateElement, o = e.Node, s = e.Element, c = e.NodeFilter;
        e.NamedNodeMap === void 0 && (e.NamedNodeMap || e.MozNamedAttrMap), e.HTMLFormElement;
        let l = e.DOMParser, u = e.trustedTypes, d = s.prototype, ee = w(d, `cloneNode`), te = w(d, `remove`), ne = w(d, `nextSibling`), f = w(d, `childNodes`), p = w(d, `parentNode`), ie = w(d, `shadowRoot`), ae = w(d, `attributes`), m = o && o.prototype ? w(o.prototype, `nodeType`) : null, se = o && o.prototype ? w(o.prototype, `nodeName`) : null, ce = o && o.prototype ? w(o.prototype, `ownerDocument`) : null, le = function(e) {
            return m ? m(e) : e.nodeType;
        }, Se = function(e) {
            return se ? se(e) : e.nodeName;
        };
        if (typeof a == `function`) {
            let e = n.createElement(`template`);
            e.content && e.content.ownerDocument && (n = e.content.ownerDocument);
        }
        let _, v = ``, Ce, we = !1, x = 0, Ee = function() {
            if (x > 0) throw Te(`A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the "DOMPurify and Trusted Types" section of the README.`);
        }, De = function(e) {
            Ee(), x++;
            try {
                return _.createHTML(e);
            } finally{
                x--;
            }
        }, tt = function(e) {
            Ee(), x++;
            try {
                return _.createScriptURL(e);
            } finally{
                x--;
            }
        }, ut = function() {
            return we ||= (Ce = at(u, i), !0), Ce;
        }, dt = n, E = dt.implementation, D = dt.createNodeIterator, O = dt.createDocumentFragment, ft = dt.getElementsByTagName, pt = r.importNode, k = ot();
        t.isSupported = typeof re == `function` && typeof p == `function` && E && E.createHTMLDocument !== void 0;
        let mt = Ve, ht = He, gt = Ue, A = We, _t = Ge, j = qe, vt = Je, yt = Xe, M = Ke, N = null, P = S({}, [
            ...Ae,
            ...je,
            ...Me,
            ...Pe,
            ...Ie
        ]), F = null, I = S({}, [
            ...Le,
            ...Re,
            ...ze,
            ...Be
        ]), L = Object.seal(oe(null, {
            tagNameCheck: {
                writable: !0,
                configurable: !1,
                enumerable: !0,
                value: null
            },
            attributeNameCheck: {
                writable: !0,
                configurable: !1,
                enumerable: !0,
                value: null
            },
            allowCustomizedBuiltInElements: {
                writable: !0,
                configurable: !1,
                enumerable: !0,
                value: !1
            }
        })), R = null, bt = null, z = Object.seal(oe(null, {
            tagCheck: {
                writable: !0,
                configurable: !1,
                enumerable: !0,
                value: null
            },
            attributeCheck: {
                writable: !0,
                configurable: !1,
                enumerable: !0,
                value: null
            }
        })), B = !0, V = !0, H = !1, xt = !0, U = !1, St = !0, Ct = !1, wt = !1, Tt = null, Et = null, Dt = !1, Ot = !1, kt = !1, At = !1, jt = !0, Mt = !1, Nt = `user-content-`, Pt = !0, Ft = !1, It = {}, Lt = null, Rt = S({}, `annotation-xml.audio.colgroup.desc.foreignobject.head.iframe.math.mi.mn.mo.ms.mtext.noembed.noframes.noscript.plaintext.script.selectedcontent.style.svg.template.thead.title.video.xmp`.split(`.`)), zt = null, Bt = S({}, [
            `audio`,
            `video`,
            `img`,
            `source`,
            `image`,
            `track`
        ]), W = null, G = S({}, [
            `alt`,
            `class`,
            `for`,
            `id`,
            `label`,
            `name`,
            `pattern`,
            `placeholder`,
            `role`,
            `summary`,
            `title`,
            `value`,
            `style`,
            `xmlns`
        ]), Vt = `http://www.w3.org/1998/Math/MathML`, Ht = `http://www.w3.org/2000/svg`, K = `http://www.w3.org/1999/xhtml`, Ut = K, Wt = !1, Gt = null, Kt = S({}, [
            Vt,
            Ht,
            K
        ], _e), qt = h([
            `mi`,
            `mo`,
            `mn`,
            `ms`,
            `mtext`
        ]), Jt = S({}, qt), Yt = h([
            `annotation-xml`
        ]), q = S({}, Yt), Xt = S({}, [
            `title`,
            `style`,
            `font`,
            `a`,
            `script`
        ]), J = null, Zt = [
            `application/xhtml+xml`,
            `text/html`
        ], Y = null, Qt = null, $t = n.createElement(`form`), en = function(e) {
            return e instanceof RegExp || e instanceof Function;
        }, tn = function() {
            let e = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
            if (Qt && Qt === e) return;
            (!e || typeof e != `object`) && (e = {}), e = C(e), J = Zt.indexOf(e.PARSER_MEDIA_TYPE) === -1 ? `text/html` : e.PARSER_MEDIA_TYPE, Y = J === `application/xhtml+xml` ? _e : ge, N = st(e, `ALLOWED_TAGS`, P, {
                transform: Y
            }), F = st(e, `ALLOWED_ATTR`, I, {
                transform: Y
            }), Gt = st(e, `ALLOWED_NAMESPACES`, Kt, {
                transform: _e
            }), W = st(e, `ADD_URI_SAFE_ATTR`, G, {
                transform: Y,
                base: G
            }), zt = st(e, `ADD_DATA_URI_TAGS`, Bt, {
                transform: Y,
                base: Bt
            }), Lt = st(e, `FORBID_CONTENTS`, Rt, {
                transform: Y
            }), R = st(e, `FORBID_TAGS`, C({}), {
                transform: Y
            }), bt = st(e, `FORBID_ATTR`, C({}), {
                transform: Y
            }), It = y(e, `USE_PROFILES`) ? e.USE_PROFILES && typeof e.USE_PROFILES == `object` ? C(e.USE_PROFILES) : e.USE_PROFILES : !1, B = e.ALLOW_ARIA_ATTR !== !1, V = e.ALLOW_DATA_ATTR !== !1, H = e.ALLOW_UNKNOWN_PROTOCOLS || !1, xt = e.ALLOW_SELF_CLOSE_IN_ATTR !== !1, U = e.SAFE_FOR_TEMPLATES || !1, St = e.SAFE_FOR_XML !== !1, Ct = e.WHOLE_DOCUMENT || !1, Ot = e.RETURN_DOM || !1, kt = e.RETURN_DOM_FRAGMENT || !1, At = e.RETURN_TRUSTED_TYPE || !1, Dt = e.FORCE_BODY || !1, jt = e.SANITIZE_DOM !== !1, Mt = e.SANITIZE_NAMED_PROPS || !1, Pt = e.KEEP_CONTENT !== !1, Ft = e.IN_PLACE || !1, M = ke(e.ALLOWED_URI_REGEXP) ? e.ALLOWED_URI_REGEXP : Ke, Ut = typeof e.NAMESPACE == `string` ? e.NAMESPACE : K, Jt = ct(e, `MATHML_TEXT_INTEGRATION_POINTS`, ()=>S({}, qt)), q = ct(e, `HTML_INTEGRATION_POINTS`, ()=>S({}, Yt));
            let t = ct(e, `CUSTOM_ELEMENT_HANDLING`, ()=>oe(null));
            if (L = oe(null), y(t, `tagNameCheck`) && en(t.tagNameCheck) && (L.tagNameCheck = t.tagNameCheck), y(t, `attributeNameCheck`) && en(t.attributeNameCheck) && (L.attributeNameCheck = t.attributeNameCheck), y(t, `allowCustomizedBuiltInElements`) && typeof t.allowCustomizedBuiltInElements == `boolean` && (L.allowCustomizedBuiltInElements = t.allowCustomizedBuiltInElements), g(L), U && (V = !1), kt && (Ot = !0), It && (N = S({}, Ie), F = oe(null), It.html === !0 && (S(N, Ae), S(F, Le)), It.svg === !0 && (S(N, je), S(F, Re), S(F, Be)), It.svgFilters === !0 && (S(N, Me), S(F, Re), S(F, Be)), It.mathMl === !0 && (S(N, Pe), S(F, ze), S(F, Be))), z.tagCheck = null, z.attributeCheck = null, y(e, `ADD_TAGS`) && (typeof e.ADD_TAGS == `function` ? z.tagCheck = e.ADD_TAGS : he(e.ADD_TAGS) && (N === P && (N = C(N)), S(N, e.ADD_TAGS, Y))), y(e, `ADD_ATTR`) && (typeof e.ADD_ATTR == `function` ? z.attributeCheck = e.ADD_ATTR : he(e.ADD_ATTR) && (F === I && (F = C(F)), S(F, e.ADD_ATTR, Y))), y(e, `ADD_FORBID_CONTENTS`) && he(e.ADD_FORBID_CONTENTS) && (Lt === Rt && (Lt = C(Lt)), S(Lt, e.ADD_FORBID_CONTENTS, Y)), Pt && (N[`#text`] = !0), Ct && S(N, [
                `html`,
                `head`,
                `body`
            ]), N.table && (S(N, [
                `tbody`
            ]), delete R.tbody), e.TRUSTED_TYPES_POLICY) {
                if (typeof e.TRUSTED_TYPES_POLICY.createHTML != `function`) throw Te(`TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.`);
                if (typeof e.TRUSTED_TYPES_POLICY.createScriptURL != `function`) throw Te(`TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.`);
                let t = _;
                _ = e.TRUSTED_TYPES_POLICY;
                try {
                    v = De(``);
                } catch (e) {
                    throw _ = t, e;
                }
            } else e.TRUSTED_TYPES_POLICY === null ? (_ = void 0, v = ``) : (_ === void 0 && (_ = ut()), _ && typeof v == `string` && (v = De(``)));
            h && h(e), Qt = e;
        }, nn = S({}, [
            ...je,
            ...Me,
            ...Ne
        ]), rn = S({}, [
            ...Pe,
            ...Fe
        ]), an = function(e, t, n) {
            return t.namespaceURI === K ? e === `svg` : t.namespaceURI === Vt ? e === `svg` && (n === `annotation-xml` || Jt[n]) : !!nn[e];
        }, on = function(e, t, n) {
            return t.namespaceURI === K ? e === `math` : t.namespaceURI === Ht ? e === `math` && q[n] : !!rn[e];
        }, sn = function(e, t, n) {
            return t.namespaceURI === Ht && !q[n] || t.namespaceURI === Vt && !Jt[n] ? !1 : !rn[e] && (Xt[e] || !nn[e]);
        }, cn = function(e) {
            let t = p(e);
            (!t || !t.tagName) && (t = {
                namespaceURI: Ut,
                tagName: `template`
            });
            let n = ge(e.tagName), r = ge(t.tagName);
            return Gt[e.namespaceURI] ? e.namespaceURI === Ht ? an(n, t, r) : e.namespaceURI === Vt ? on(n, t, r) : e.namespaceURI === K ? sn(n, t, r) : !!(J === `application/xhtml+xml` && Gt[e.namespaceURI]) : !1;
        }, X = function(e) {
            pe(t.removed, {
                element: e
            });
            try {
                p(e).removeChild(e);
            } catch  {
                if (te(e), !p(e)) throw Te(`a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place`);
            }
        }, ln = function(e, t, n) {
            try {
                e.removeAttributeNode(t);
            } catch  {
                try {
                    e.removeAttribute(n);
                } catch  {}
            }
        }, un = function(e) {
            pn(e);
            let t = f(e);
            if (t) {
                let e = [];
                ue(t, (t)=>{
                    pe(e, t);
                }), ue(e, (e)=>{
                    try {
                        te(e);
                    } catch  {}
                });
            }
            let n = ae(e);
            if (n) for(let t = n.length - 1; t >= 0; --t){
                let r = n[t], i = r && r.name;
                typeof i == `string` && ln(e, r, i);
            }
        }, dn = function(e, n, r) {
            if (!r) try {
                r = n.getAttributeNode(e);
            } catch  {
                r = null;
            }
            pe(t.removed, {
                attribute: r || null,
                from: n
            });
            try {
                r ? n.removeAttributeNode(r) : n.removeAttribute(e);
            } catch  {
                try {
                    n.removeAttribute(e);
                } catch  {}
            }
            if (e === `is`) if (Ot || kt) try {
                X(n);
            } catch  {}
            else try {
                n.setAttribute(e, ``);
            } catch  {}
        }, fn = function(e) {
            let t = ae(e);
            if (t) for(let n = t.length - 1; n >= 0; --n){
                let r = t[n], i = r && r.name;
                typeof i != `string` || F[Y(i)] || ln(e, r, i);
            }
        }, pn = function(e) {
            let t = [
                e
            ];
            for(; t.length > 0;){
                let e = t.pop();
                le(e) === T.element && fn(e);
                let n = f(e);
                if (n) for(let e = n.length - 1; e >= 0; --e)t.push(n[e]);
            }
        }, mn = function(e, t) {
            return St ? e === `patchsrc` ? !0 : e === `for` && t !== `label` && t !== `output` : !1;
        }, hn = function(e) {
            if (!St) return;
            let t = [
                e
            ];
            for(; t.length > 0;){
                let e = t.pop(), n = le(e);
                if (n === T.processingInstruction || n === T.comment && b(Qe, e.data)) {
                    try {
                        te(e);
                    } catch  {}
                    continue;
                }
                if (n === T.element) {
                    let t = e, n = Y(Se(e));
                    try {
                        t.hasAttribute && t.hasAttribute(`patchsrc`) && t.removeAttribute(`patchsrc`), t.hasAttribute && t.hasAttribute(`for`) && mn(`for`, n) && t.removeAttribute(`for`);
                    } catch  {}
                }
                let r = f(e);
                if (r) for(let e = r.length - 1; e >= 0; --e)t.push(r[e]);
            }
        }, gn = function(e) {
            let t = null, r = null;
            if (Dt) e = `<remove></remove>` + e;
            else {
                let t = ve(e, /^[\r\n\t ]+/);
                r = t && t[0];
            }
            J === `application/xhtml+xml` && Ut === K && (e = `<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>` + e + `</body></html>`);
            let i = _ ? De(e) : e;
            if (Ut === K) try {
                t = new l().parseFromString(i, J);
            } catch  {}
            if (!t || !t.documentElement) {
                t = E.createDocument(Ut, `template`, null);
                try {
                    t.documentElement.innerHTML = Wt ? v : i;
                } catch  {}
            }
            let a = t.body || t.documentElement;
            return e && r && a.insertBefore(n.createTextNode(r), a.childNodes[0] || null), Ut === K ? ft.call(t, Ct ? `html` : `body`)[0] : Ct ? t.documentElement : a;
        }, _n = function(e) {
            let t = ce ? ce(e) : e.ownerDocument;
            return D.call(t || e, e, c.SHOW_ELEMENT | c.SHOW_COMMENT | c.SHOW_TEXT | c.SHOW_PROCESSING_INSTRUCTION | c.SHOW_CDATA_SECTION, null);
        }, vn = function(e) {
            return e = ye(e, mt, ` `), e = ye(e, ht, ` `), e = ye(e, gt, ` `), e;
        }, yn = function(e) {
            e.normalize();
            let t = ce ? ce(e) : e.ownerDocument, n = D.call(t || e, e, c.SHOW_TEXT | c.SHOW_COMMENT | c.SHOW_CDATA_SECTION | c.SHOW_PROCESSING_INSTRUCTION, null), r = n.nextNode();
            for(; r;)r.data = vn(r.data), r = n.nextNode();
            let i = e.querySelectorAll?.call(e, `template`);
            i && ue(i, (e)=>{
                xn(e.content) && yn(e.content);
            });
        }, bn = function(e) {
            let t = se ? se(e) : null;
            return typeof t != `string` || Y(t) !== `form` ? !1 : typeof e.nodeName != `string` || typeof e.textContent != `string` || typeof e.removeChild != `function` || e.attributes !== ae(e) || typeof e.removeAttribute != `function` || typeof e.setAttribute != `function` || typeof e.namespaceURI != `string` || typeof e.insertBefore != `function` || typeof e.hasChildNodes != `function` || e.nodeType !== m(e) || e.childNodes !== f(e);
        }, xn = function(e) {
            if (!m || typeof e != `object` || !e) return !1;
            try {
                return m(e) === T.documentFragment;
            } catch  {
                return !1;
            }
        }, Z = function(e) {
            if (!m || typeof e != `object` || !e) return !1;
            try {
                return typeof m(e) == `number`;
            } catch  {
                return !1;
            }
        };
        function Q(e, n, r) {
            e.length !== 0 && ue(e, (e)=>{
                e.call(t, n, r, Qt);
            });
        }
        let Sn = function(e, t) {
            return !!(St && e.hasChildNodes() && !Z(e.firstElementChild) && b(Ze, e.textContent) && b(Ze, e.innerHTML) || St && e.namespaceURI === K && nt[t] && (Z(e.firstElementChild) || typeof e.textContent == `string` && b(rt[t], e.textContent)) || e.nodeType === T.processingInstruction || St && e.nodeType === T.comment && b(Qe, e.data));
        }, Cn = function(e, t) {
            return e instanceof RegExp ? b(e, t) : e instanceof Function ? !!e(t, ...[
                ...arguments
            ].slice(2)) : !1;
        }, wn = function(e, t, n) {
            if (!R[t] && kn(t) && Cn(L.tagNameCheck, t)) return !1;
            if (Pt && !Lt[t]) {
                let t = p(e), r = f(e);
                if (r && t) {
                    let i = r.length;
                    for(let a = i - 1; a >= 0; --a){
                        let i = e === n ? ee(r[a], !0) : r[a];
                        t.insertBefore(i, ne(e));
                    }
                }
            }
            return X(e), !0;
        }, Tn = function(e, t, n, r) {
            return e.length === 0 ? t : t === n || t === r ? C(t) : t;
        }, $ = function(e, t) {
            return e === t || p(e) !== null ? !1 : (Ft && pn(e), !0);
        }, En = function(e, n) {
            if (Q(k.beforeSanitizeElements, e, null), $(e, n)) return !0;
            if (bn(e)) return X(e), !0;
            let r = Y(Se(e));
            if (N = Tn(k.uponSanitizeElement, N, P, Tt), Q(k.uponSanitizeElement, e, {
                tagName: r,
                allowedTags: N
            }), $(e, n)) return !0;
            if (Sn(e, r)) return X(e), !0;
            if (R[r] || !(z.tagCheck instanceof Function && z.tagCheck(r)) && !N[r]) {
                let t = wn(e, r, n);
                return t === !1 && Q(k.afterSanitizeElements, e, null), t;
            }
            if (le(e) === T.element && !cn(e) || (r === `noscript` || r === `noembed` || r === `noframes`) && b($e, e.innerHTML)) return X(e), !0;
            if (U && e.nodeType === T.text) {
                let n = vn(e.textContent);
                e.textContent !== n && (pe(t.removed, {
                    element: e.cloneNode()
                }), e.textContent = n);
            }
            return Q(k.afterSanitizeElements, e, null), !1;
        }, Dn = function(e, t, r) {
            if (bt[t] || mn(t, e) || jt && (t === `id` || t === `name`) && (r in n || r in $t)) return !1;
            let i = F[t] || z.attributeCheck instanceof Function && z.attributeCheck(t, e);
            return V && b(A, t) || B && b(_t, t) ? !0 : i ? W[t] || b(M, ye(r, vt, ``)) || (t === `src` || t === `xlink:href` || t === `href`) && e !== `script` && be(r, `data:`) === 0 && zt[e] || H && !b(j, ye(r, vt, ``)) ? !0 : !r : kn(e) && Cn(L.tagNameCheck, e) && Cn(L.attributeNameCheck, t, e) || t === `is` && L.allowCustomizedBuiltInElements && Cn(L.tagNameCheck, r);
        }, On = S({}, [
            `annotation-xml`,
            `color-profile`,
            `font-face`,
            `font-face-format`,
            `font-face-name`,
            `font-face-src`,
            `font-face-uri`,
            `missing-glyph`
        ]), kn = function(e) {
            return !On[ge(e)] && b(yt, e);
        }, An = function(e, t, n, r) {
            if (_ && typeof u == `object` && typeof u.getAttributeType == `function` && !n) switch(u.getAttributeType(e, t)){
                case `TrustedHTML`:
                    return De(r);
                case `TrustedScriptURL`:
                    return tt(r);
            }
            return r;
        }, jn = function(e, n, r, i) {
            try {
                r ? e.setAttributeNS(r, n, i) : e.setAttribute(n, i), bn(e) ? X(e) : fe(t.removed);
            } catch  {
                dn(n, e);
            }
        }, Mn = function(e) {
            Q(k.beforeSanitizeAttributes, e, null);
            let t = e.attributes;
            if (!t || bn(e)) return;
            F = Tn(k.uponSanitizeAttribute, F, I, Et);
            let n = {
                attrName: ``,
                attrValue: ``,
                keepAttr: !0,
                allowedAttributes: F,
                forceKeepAttr: void 0
            }, r = t.length, i = Y(e.nodeName);
            for(; r--;){
                let a = t[r], o = a.name, s = a.namespaceURI, c = a.value, l = Y(o), u = c, d = o === `value` ? u : xe(u);
                if (n.attrName = l, n.attrValue = d, n.keepAttr = !0, n.forceKeepAttr = void 0, Q(k.uponSanitizeAttribute, e, n), d = n.attrValue, Mt && (l === `id` || l === `name`) && be(d, Nt) !== 0 && (dn(o, e, a), d = Nt + d), St && b(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, d)) {
                    dn(o, e, a);
                    continue;
                }
                if (l === `attributename` && ve(d, `href`)) {
                    dn(o, e, a);
                    continue;
                }
                if (!n.forceKeepAttr) {
                    if (!n.keepAttr) {
                        dn(o, e, a);
                        continue;
                    }
                    if (!xt && b(et, d)) {
                        dn(o, e, a);
                        continue;
                    }
                    if (U && (d = vn(d)), !Dn(i, l, d)) {
                        dn(o, e, a);
                        continue;
                    }
                    d = An(i, l, s, d), d !== u && jn(e, o, s, d);
                }
            }
            Q(k.afterSanitizeAttributes, e, null);
        }, Nn = function(e) {
            let t = null, n = _n(e);
            for(Q(k.beforeSanitizeShadowDOM, e, null); t = n.nextNode();)if (Q(k.uponSanitizeShadowNode, t, null), En(t, e), Mn(t), xn(t.content) && Nn(t.content), le(t) === T.element) {
                let e = ie(t);
                xn(e) && (Pn(e), Nn(e));
            }
            Q(k.afterSanitizeShadowDOM, e, null);
        }, Pn = function(e) {
            let t = [
                {
                    node: e,
                    shadow: null
                }
            ];
            for(; t.length > 0;){
                let e = t.pop();
                if (e.shadow) {
                    Nn(e.shadow);
                    continue;
                }
                let n = e.node, r = le(n) === T.element, i = f(n);
                if (i) for(let e = i.length - 1; e >= 0; --e)t.push({
                    node: i[e],
                    shadow: null
                });
                if (r) {
                    let e = se ? se(n) : null;
                    if (typeof e == `string` && Y(e) === `template`) {
                        let e = n.content;
                        xn(e) && t.push({
                            node: e,
                            shadow: null
                        });
                    }
                }
                if (r) {
                    let e = ie(n);
                    xn(e) && t.push({
                        node: null,
                        shadow: e
                    }, {
                        node: e,
                        shadow: null
                    });
                }
            }
        };
        return t.sanitize = function(e) {
            let n = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {}, i = null, a = null, o = null, s = null;
            if (Wt = !e, Wt && (e = `<!-->`), typeof e != `string` && !Z(e) && (e = Oe(e), typeof e != `string`)) throw Te(`dirty is not a string, aborting`);
            if (!t.isSupported) return e;
            wt ? (N = Tt, F = Et) : tn(n), (k.uponSanitizeElement.length > 0 || k.uponSanitizeAttribute.length > 0) && (N = C(N)), k.uponSanitizeAttribute.length > 0 && (F = C(F)), t.removed = [];
            let c = Ft && typeof e != `string` && Z(e);
            if (c) {
                hn(e);
                let t = Se(e);
                if (typeof t == `string`) {
                    let n = Y(t);
                    if (!N[n] || R[n]) throw un(e), Te(`root node is forbidden and cannot be sanitized in-place`);
                }
                if (bn(e)) throw un(e), Te(`root node is clobbered and cannot be sanitized in-place`);
                try {
                    Pn(e);
                } catch (t) {
                    throw un(e), t;
                }
            } else if (Z(e)) i = gn(`<!---->`), a = i.ownerDocument.importNode(e, !0), a.nodeType === T.element && a.nodeName === `BODY` || a.nodeName === `HTML` ? i = a : i.appendChild(a), Pn(a);
            else {
                if (!Ot && !U && !Ct && e.indexOf(`<`) === -1) return _ && At ? De(e) : e;
                if (i = gn(e), !i) return Ot ? null : At ? v : ``;
            }
            i && Dt && X(i.firstChild);
            let l = c ? e : i;
            try {
                let e = _n(l);
                for(; o = e.nextNode();)En(o, l), Mn(o), xn(o.content) && Nn(o.content);
            } catch (n) {
                throw c && (un(e), ue(t.removed, (e)=>{
                    e.element && pn(e.element);
                })), n;
            }
            if (c) return ue(t.removed, (e)=>{
                e.element && pn(e.element);
            }), U && yn(e), e;
            if (Ot) {
                if (U && yn(i), kt) for(s = O.call(i.ownerDocument); i.firstChild;)s.appendChild(i.firstChild);
                else s = i;
                return (F.shadowroot || F.shadowrootmode) && (s = pt.call(r, s, !0)), s;
            }
            let u = Ct ? i.outerHTML : i.innerHTML;
            return Ct && N[`!doctype`] && i.ownerDocument && i.ownerDocument.doctype && i.ownerDocument.doctype.name && b(Ye, i.ownerDocument.doctype.name) && (u = `<!DOCTYPE ` + i.ownerDocument.doctype.name + `>
` + u), U && (u = vn(u)), _ && At ? De(u) : u;
        }, t.setConfig = function() {
            tn(arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {}), wt = !0, Tt = N, Et = F;
        }, t.clearConfig = function() {
            Qt = null, wt = !1, Tt = null, Et = null, _ = Ce, v = ``;
        }, t.isValidAttribute = function(e, t, n) {
            return Qt || tn({}), Dn(Y(e), Y(t), n);
        }, t.addHook = function(e, t) {
            typeof t == `function` && y(k, e) && pe(k[e], t);
        }, t.removeHook = function(e, t) {
            if (y(k, e)) {
                if (t !== void 0) {
                    let n = de(k[e], t);
                    return n === -1 ? void 0 : me(k[e], n, 1)[0];
                }
                return fe(k[e]);
            }
        }, t.removeHooks = function(e) {
            y(k, e) && (k[e] = []);
        }, t.removeAllHooks = function() {
            k = ot();
        }, t;
    }
    let dt, D;
    ut = lt();
    dt = {
        min: {
            r: 0,
            g: 0,
            b: 0,
            s: 0,
            l: 0,
            a: 0
        },
        max: {
            r: 255,
            g: 255,
            b: 255,
            h: 360,
            s: 100,
            l: 100,
            a: 1
        },
        clamp: {
            r: (e)=>e >= 255 ? 255 : e < 0 ? 0 : e,
            g: (e)=>e >= 255 ? 255 : e < 0 ? 0 : e,
            b: (e)=>e >= 255 ? 255 : e < 0 ? 0 : e,
            h: (e)=>e % 360,
            s: (e)=>e >= 100 ? 100 : e < 0 ? 0 : e,
            l: (e)=>e >= 100 ? 100 : e < 0 ? 0 : e,
            a: (e)=>e >= 1 ? 1 : e < 0 ? 0 : e
        },
        toLinear: (e)=>{
            let t = e / 255;
            return e > .03928 ? ((t + .055) / 1.055) ** 2.4 : t / 12.92;
        },
        hue2rgb: (e, t, n)=>(n < 0 && (n += 1), n > 1 && --n, n < 1 / 6 ? e + (t - e) * 6 * n : n < 1 / 2 ? t : n < 2 / 3 ? e + (t - e) * (2 / 3 - n) * 6 : e),
        hsl2rgb: ({ h: e, s: t, l: n }, r)=>{
            if (!t) return n * 2.55;
            e /= 360, t /= 100, n /= 100;
            let i = n < .5 ? n * (1 + t) : n + t - n * t, a = 2 * n - i;
            switch(r){
                case `r`:
                    return dt.hue2rgb(a, i, e + 1 / 3) * 255;
                case `g`:
                    return dt.hue2rgb(a, i, e) * 255;
                case `b`:
                    return dt.hue2rgb(a, i, e - 1 / 3) * 255;
            }
        },
        rgb2hsl: ({ r: e, g: t, b: n }, r)=>{
            e /= 255, t /= 255, n /= 255;
            let i = Math.max(e, t, n), a = Math.min(e, t, n), o = (i + a) / 2;
            if (r === `l`) return o * 100;
            if (i === a) return 0;
            let s = i - a, c = o > .5 ? s / (2 - i - a) : s / (i + a);
            if (r === `s`) return c * 100;
            switch(i){
                case e:
                    return ((t - n) / s + (t < n ? 6 : 0)) * 60;
                case t:
                    return ((n - e) / s + 2) * 60;
                case n:
                    return ((e - t) / s + 4) * 60;
                default:
                    return -1;
            }
        }
    };
    E = {
        channel: dt,
        lang: {
            clamp: (e, t, n)=>t > n ? Math.min(t, Math.max(n, e)) : Math.min(n, Math.max(t, e)),
            round: (e)=>Math.round(e * 1e10) / 1e10
        },
        unit: {
            dec2hex: (e)=>{
                let t = Math.round(e).toString(16);
                return t.length > 1 ? t : `0${t}`;
            }
        }
    };
    D = {};
    for(let e = 0; e <= 255; e++)D[e] = E.unit.dec2hex(e);
    let O, ft, pt, k, mt, ht, gt, _t, vt, yt, I, L, R;
    O = {
        ALL: 0,
        RGB: 1,
        HSL: 2
    };
    ft = class {
        constructor(){
            this.type = O.ALL;
        }
        get() {
            return this.type;
        }
        set(e) {
            if (this.type && this.type !== e) throw Error(`Cannot change both RGB and HSL channels at the same time`);
            this.type = e;
        }
        reset() {
            this.type = O.ALL;
        }
        is(e) {
            return this.type === e;
        }
    };
    pt = new class {
        constructor(e, t){
            this.color = t, this.changed = !1, this.data = e, this.type = new ft;
        }
        set(e, t) {
            return this.color = t, this.changed = !1, this.data = e, this.type.type = O.ALL, this;
        }
        _ensureHSL() {
            let e = this.data, { h: t, s: n, l: r } = e;
            t === void 0 && (e.h = E.channel.rgb2hsl(e, `h`)), n === void 0 && (e.s = E.channel.rgb2hsl(e, `s`)), r === void 0 && (e.l = E.channel.rgb2hsl(e, `l`));
        }
        _ensureRGB() {
            let e = this.data, { r: t, g: n, b: r } = e;
            t === void 0 && (e.r = E.channel.hsl2rgb(e, `r`)), n === void 0 && (e.g = E.channel.hsl2rgb(e, `g`)), r === void 0 && (e.b = E.channel.hsl2rgb(e, `b`));
        }
        get r() {
            let e = this.data, t = e.r;
            return !this.type.is(O.HSL) && t !== void 0 ? t : (this._ensureHSL(), E.channel.hsl2rgb(e, `r`));
        }
        get g() {
            let e = this.data, t = e.g;
            return !this.type.is(O.HSL) && t !== void 0 ? t : (this._ensureHSL(), E.channel.hsl2rgb(e, `g`));
        }
        get b() {
            let e = this.data, t = e.b;
            return !this.type.is(O.HSL) && t !== void 0 ? t : (this._ensureHSL(), E.channel.hsl2rgb(e, `b`));
        }
        get h() {
            let e = this.data, t = e.h;
            return !this.type.is(O.RGB) && t !== void 0 ? t : (this._ensureRGB(), E.channel.rgb2hsl(e, `h`));
        }
        get s() {
            let e = this.data, t = e.s;
            return !this.type.is(O.RGB) && t !== void 0 ? t : (this._ensureRGB(), E.channel.rgb2hsl(e, `s`));
        }
        get l() {
            let e = this.data, t = e.l;
            return !this.type.is(O.RGB) && t !== void 0 ? t : (this._ensureRGB(), E.channel.rgb2hsl(e, `l`));
        }
        get a() {
            return this.data.a;
        }
        set r(e) {
            this.type.set(O.RGB), this.changed = !0, this.data.r = e;
        }
        set g(e) {
            this.type.set(O.RGB), this.changed = !0, this.data.g = e;
        }
        set b(e) {
            this.type.set(O.RGB), this.changed = !0, this.data.b = e;
        }
        set h(e) {
            this.type.set(O.HSL), this.changed = !0, this.data.h = e;
        }
        set s(e) {
            this.type.set(O.HSL), this.changed = !0, this.data.s = e;
        }
        set l(e) {
            this.type.set(O.HSL), this.changed = !0, this.data.l = e;
        }
        set a(e) {
            this.changed = !0, this.data.a = e;
        }
    }({
        r: 0,
        g: 0,
        b: 0,
        a: 0
    }, `transparent`);
    k = {
        re: /^#((?:[a-f0-9]{2}){2,4}|[a-f0-9]{3})$/i,
        parse: (e)=>{
            if (e.charCodeAt(0) !== 35) return;
            let t = e.match(k.re);
            if (!t) return;
            let n = t[1], r = parseInt(n, 16), i = n.length, a = i % 4 == 0, o = i > 4, s = o ? 1 : 17, c = o ? 8 : 4, l = a ? 0 : -1, u = o ? 255 : 15;
            return pt.set({
                r: (r >> c * (l + 3) & u) * s,
                g: (r >> c * (l + 2) & u) * s,
                b: (r >> c * (l + 1) & u) * s,
                a: a ? (r & u) * s / 255 : 1
            }, e);
        },
        stringify: (e)=>{
            let { r: t, g: n, b: r, a: i } = e;
            return i < 1 ? `#${D[Math.round(t)]}${D[Math.round(n)]}${D[Math.round(r)]}${D[Math.round(i * 255)]}` : `#${D[Math.round(t)]}${D[Math.round(n)]}${D[Math.round(r)]}`;
        }
    };
    mt = {
        re: /^hsla?\(\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e-?\d+)?(?:deg|grad|rad|turn)?)\s*?(?:,|\s)\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e-?\d+)?%)\s*?(?:,|\s)\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e-?\d+)?%)(?:\s*?(?:,|\/)\s*?\+?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e-?\d+)?(%)?))?\s*?\)$/i,
        hueRe: /^(.+?)(deg|grad|rad|turn)$/i,
        _hue2deg: (e)=>{
            let t = e.match(mt.hueRe);
            if (t) {
                let [, e, n] = t;
                switch(n){
                    case `grad`:
                        return E.channel.clamp.h(parseFloat(e) * .9);
                    case `rad`:
                        return E.channel.clamp.h(parseFloat(e) * 180 / Math.PI);
                    case `turn`:
                        return E.channel.clamp.h(parseFloat(e) * 360);
                }
            }
            return E.channel.clamp.h(parseFloat(e));
        },
        parse: (e)=>{
            let t = e.charCodeAt(0);
            if (t !== 104 && t !== 72) return;
            let n = e.match(mt.re);
            if (!n) return;
            let [, r, i, a, o, s] = n;
            return pt.set({
                h: mt._hue2deg(r),
                s: E.channel.clamp.s(parseFloat(i)),
                l: E.channel.clamp.l(parseFloat(a)),
                a: o ? E.channel.clamp.a(s ? parseFloat(o) / 100 : parseFloat(o)) : 1
            }, e);
        },
        stringify: (e)=>{
            let { h: t, s: n, l: r, a: i } = e;
            return i < 1 ? `hsla(${E.lang.round(t)}, ${E.lang.round(n)}%, ${E.lang.round(r)}%, ${i})` : `hsl(${E.lang.round(t)}, ${E.lang.round(n)}%, ${E.lang.round(r)}%)`;
        }
    };
    ht = {
        colors: {
            aliceblue: `#f0f8ff`,
            antiquewhite: `#faebd7`,
            aqua: `#00ffff`,
            aquamarine: `#7fffd4`,
            azure: `#f0ffff`,
            beige: `#f5f5dc`,
            bisque: `#ffe4c4`,
            black: `#000000`,
            blanchedalmond: `#ffebcd`,
            blue: `#0000ff`,
            blueviolet: `#8a2be2`,
            brown: `#a52a2a`,
            burlywood: `#deb887`,
            cadetblue: `#5f9ea0`,
            chartreuse: `#7fff00`,
            chocolate: `#d2691e`,
            coral: `#ff7f50`,
            cornflowerblue: `#6495ed`,
            cornsilk: `#fff8dc`,
            crimson: `#dc143c`,
            cyanaqua: `#00ffff`,
            darkblue: `#00008b`,
            darkcyan: `#008b8b`,
            darkgoldenrod: `#b8860b`,
            darkgray: `#a9a9a9`,
            darkgreen: `#006400`,
            darkgrey: `#a9a9a9`,
            darkkhaki: `#bdb76b`,
            darkmagenta: `#8b008b`,
            darkolivegreen: `#556b2f`,
            darkorange: `#ff8c00`,
            darkorchid: `#9932cc`,
            darkred: `#8b0000`,
            darksalmon: `#e9967a`,
            darkseagreen: `#8fbc8f`,
            darkslateblue: `#483d8b`,
            darkslategray: `#2f4f4f`,
            darkslategrey: `#2f4f4f`,
            darkturquoise: `#00ced1`,
            darkviolet: `#9400d3`,
            deeppink: `#ff1493`,
            deepskyblue: `#00bfff`,
            dimgray: `#696969`,
            dimgrey: `#696969`,
            dodgerblue: `#1e90ff`,
            firebrick: `#b22222`,
            floralwhite: `#fffaf0`,
            forestgreen: `#228b22`,
            fuchsia: `#ff00ff`,
            gainsboro: `#dcdcdc`,
            ghostwhite: `#f8f8ff`,
            gold: `#ffd700`,
            goldenrod: `#daa520`,
            gray: `#808080`,
            green: `#008000`,
            greenyellow: `#adff2f`,
            grey: `#808080`,
            honeydew: `#f0fff0`,
            hotpink: `#ff69b4`,
            indianred: `#cd5c5c`,
            indigo: `#4b0082`,
            ivory: `#fffff0`,
            khaki: `#f0e68c`,
            lavender: `#e6e6fa`,
            lavenderblush: `#fff0f5`,
            lawngreen: `#7cfc00`,
            lemonchiffon: `#fffacd`,
            lightblue: `#add8e6`,
            lightcoral: `#f08080`,
            lightcyan: `#e0ffff`,
            lightgoldenrodyellow: `#fafad2`,
            lightgray: `#d3d3d3`,
            lightgreen: `#90ee90`,
            lightgrey: `#d3d3d3`,
            lightpink: `#ffb6c1`,
            lightsalmon: `#ffa07a`,
            lightseagreen: `#20b2aa`,
            lightskyblue: `#87cefa`,
            lightslategray: `#778899`,
            lightslategrey: `#778899`,
            lightsteelblue: `#b0c4de`,
            lightyellow: `#ffffe0`,
            lime: `#00ff00`,
            limegreen: `#32cd32`,
            linen: `#faf0e6`,
            magenta: `#ff00ff`,
            maroon: `#800000`,
            mediumaquamarine: `#66cdaa`,
            mediumblue: `#0000cd`,
            mediumorchid: `#ba55d3`,
            mediumpurple: `#9370db`,
            mediumseagreen: `#3cb371`,
            mediumslateblue: `#7b68ee`,
            mediumspringgreen: `#00fa9a`,
            mediumturquoise: `#48d1cc`,
            mediumvioletred: `#c71585`,
            midnightblue: `#191970`,
            mintcream: `#f5fffa`,
            mistyrose: `#ffe4e1`,
            moccasin: `#ffe4b5`,
            navajowhite: `#ffdead`,
            navy: `#000080`,
            oldlace: `#fdf5e6`,
            olive: `#808000`,
            olivedrab: `#6b8e23`,
            orange: `#ffa500`,
            orangered: `#ff4500`,
            orchid: `#da70d6`,
            palegoldenrod: `#eee8aa`,
            palegreen: `#98fb98`,
            paleturquoise: `#afeeee`,
            palevioletred: `#db7093`,
            papayawhip: `#ffefd5`,
            peachpuff: `#ffdab9`,
            peru: `#cd853f`,
            pink: `#ffc0cb`,
            plum: `#dda0dd`,
            powderblue: `#b0e0e6`,
            purple: `#800080`,
            rebeccapurple: `#663399`,
            red: `#ff0000`,
            rosybrown: `#bc8f8f`,
            royalblue: `#4169e1`,
            saddlebrown: `#8b4513`,
            salmon: `#fa8072`,
            sandybrown: `#f4a460`,
            seagreen: `#2e8b57`,
            seashell: `#fff5ee`,
            sienna: `#a0522d`,
            silver: `#c0c0c0`,
            skyblue: `#87ceeb`,
            slateblue: `#6a5acd`,
            slategray: `#708090`,
            slategrey: `#708090`,
            snow: `#fffafa`,
            springgreen: `#00ff7f`,
            tan: `#d2b48c`,
            teal: `#008080`,
            thistle: `#d8bfd8`,
            transparent: `#00000000`,
            turquoise: `#40e0d0`,
            violet: `#ee82ee`,
            wheat: `#f5deb3`,
            white: `#ffffff`,
            whitesmoke: `#f5f5f5`,
            yellow: `#ffff00`,
            yellowgreen: `#9acd32`
        },
        parse: (e)=>{
            e = e.toLowerCase();
            let t = ht.colors[e];
            if (t) return k.parse(t);
        },
        stringify: (e)=>{
            let t = k.stringify(e);
            for(let e in ht.colors)if (ht.colors[e] === t) return e;
        }
    };
    gt = {
        re: /^rgba?\(\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e\d+)?(%?))\s*?(?:,|\s)\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e\d+)?(%?))\s*?(?:,|\s)\s*?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e\d+)?(%?))(?:\s*?(?:,|\/)\s*?\+?(-?(?:\d+(?:\.\d+)?|(?:\.\d+))(?:e\d+)?(%?)))?\s*?\)$/i,
        parse: (e)=>{
            let t = e.charCodeAt(0);
            if (t !== 114 && t !== 82) return;
            let n = e.match(gt.re);
            if (!n) return;
            let [, r, i, a, o, s, c, l, u] = n;
            return pt.set({
                r: E.channel.clamp.r(i ? parseFloat(r) * 2.55 : parseFloat(r)),
                g: E.channel.clamp.g(o ? parseFloat(a) * 2.55 : parseFloat(a)),
                b: E.channel.clamp.b(c ? parseFloat(s) * 2.55 : parseFloat(s)),
                a: l ? E.channel.clamp.a(u ? parseFloat(l) / 100 : parseFloat(l)) : 1
            }, e);
        },
        stringify: (e)=>{
            let { r: t, g: n, b: r, a: i } = e;
            return i < 1 ? `rgba(${E.lang.round(t)}, ${E.lang.round(n)}, ${E.lang.round(r)}, ${E.lang.round(i)})` : `rgb(${E.lang.round(t)}, ${E.lang.round(n)}, ${E.lang.round(r)})`;
        }
    };
    A = {
        format: {
            keyword: ht,
            hex: k,
            rgb: gt,
            rgba: gt,
            hsl: mt,
            hsla: mt
        },
        parse: (e)=>{
            if (typeof e != `string`) return e;
            let t = k.parse(e) || gt.parse(e) || mt.parse(e) || ht.parse(e);
            if (t) return t;
            throw Error(`Unsupported color format: "${e}"`);
        },
        stringify: (e)=>!e.changed && e.color ? e.color : e.type.is(O.HSL) || e.data.r === void 0 ? mt.stringify(e) : e.a < 1 || !Number.isInteger(e.r) || !Number.isInteger(e.g) || !Number.isInteger(e.b) ? gt.stringify(e) : k.stringify(e)
    };
    _t = (e, t)=>{
        let n = A.parse(e);
        for(let e in t)n[e] = E.channel.clamp[e](t[e]);
        return A.stringify(n);
    };
    j = (e, t, n = 0, r = 1)=>{
        if (typeof e != `number`) return _t(e, {
            a: t
        });
        let i = pt.set({
            r: E.channel.clamp.r(e),
            g: E.channel.clamp.g(t),
            b: E.channel.clamp.b(n),
            a: E.channel.clamp.a(r)
        });
        return A.stringify(i);
    };
    vt = (e)=>{
        let { r: t, g: n, b: r } = A.parse(e), i = .2126 * E.channel.toLinear(t) + .7152 * E.channel.toLinear(n) + .0722 * E.channel.toLinear(r);
        return E.lang.round(i);
    };
    yt = (e)=>vt(e) >= .5;
    M = (e)=>!yt(e);
    N = (e, t, n)=>{
        let r = A.parse(e), i = r[t], a = E.channel.clamp[t](i + n);
        return i !== a && (r[t] = a), A.stringify(r);
    };
    P = (e, t)=>N(e, `l`, t);
    F = (e, t)=>N(e, `l`, -t);
    I = (e, t)=>{
        let n = A.parse(e), r = {};
        for(let e in t)t[e] && (r[e] = n[e] + t[e]);
        return _t(e, r);
    };
    L = (e, t, n = 50)=>{
        let { r, g: i, b: a, a: o } = A.parse(e), { r: s, g: c, b: l, a: u } = A.parse(t), d = n / 100, ee = d * 2 - 1, te = o - u, ne = ((ee * te === -1 ? ee : (ee + te) / (1 + ee * te)) + 1) / 2, f = 1 - ne;
        return j(r * ne + s * f, i * ne + c * f, a * ne + l * f, o * d + u * (1 - d));
    };
    R = (e, t = 100)=>{
        let n = A.parse(e);
        return n.r = 255 - n.r, n.g = 255 - n.g, n.b = 255 - n.b, L(n, e, t);
    };
    l();
    let bt, B, V, H, xt, U, St, Ct, wt, Et, Dt, Ot, kt, At, jt, Mt, Nt, Pt, Ft, It, Lt, Rt, zt, Bt, G, Vt, Ht, K, Wt, Gt, q, Xt, J, Zt, Y, an, cn, X, ln, un, hn, bn, Q, Sn;
    bt = t((e, t, { depth: n = 2 } = {})=>{
        let r = {
            depth: n
        };
        if (Array.isArray(t) && !Array.isArray(e)) return t.forEach((t)=>bt(e, t, r)), e;
        if (Array.isArray(t) && Array.isArray(e)) return t.forEach((t)=>{
            e.includes(t) || e.push(t);
        }), e;
        if (e == null || n <= 0) return typeof e == `object` && e && typeof t == `object` ? Object.assign(e, t) : t;
        if (t != null && typeof e == `object` && typeof t == `object`) {
            let r = e;
            Object.entries(t).forEach(([t, i])=>{
                if (typeof i == `object`) {
                    if (i === null) return;
                    Object.hasOwn(e, t) || Object.defineProperty(e, t, {
                        value: void 0,
                        writable: !0,
                        enumerable: !0,
                        configurable: !0
                    }), r[t] === void 0 && (r[t] = Array.isArray(i) ? [] : {}), typeof r[t] == `object` && (r[t] = bt(r[t], i, {
                        depth: n - 1
                    }));
                } else typeof r[t] != `object` && (Object.hasOwn(e, t) ? r[t] = i : Object.defineProperty(e, t, {
                    value: i,
                    writable: !0,
                    enumerable: !0,
                    configurable: !0
                }));
            });
        }
        return e;
    }, `assignWithDepth`);
    z = bt;
    B = `#ffffff`;
    V = `#f2f2f2`;
    H = t((e, t)=>t ? I(e, {
            s: -40,
            l: 10
        }) : I(e, {
            s: -40,
            l: -10
        }), `mkBorder`);
    xt = class {
        static{
            t(this, `Theme`);
        }
        constructor(){
            this.background = `#f4f4f4`, this.primaryColor = `#fff4dd`, this.noteBkgColor = `#fff5ad`, this.noteTextColor = `#333`, this.THEME_COLOR_LIMIT = 12, this.radius = 5, this.strokeWidth = 1, this.fontFamily = `"trebuchet ms", verdana, arial, sans-serif`, this.fontSize = `16px`, this.useGradient = !0, this.dropShadow = `drop-shadow( 1px 2px 2px rgba(185,185,185,1))`;
        }
        updateColors() {
            if (this.primaryTextColor = this.primaryTextColor || (this.darkMode ? `#eee` : `#333`), this.secondaryColor = this.secondaryColor || I(this.primaryColor, {
                h: -120
            }), this.tertiaryColor = this.tertiaryColor || I(this.primaryColor, {
                h: 180,
                l: 5
            }), this.primaryBorderColor = this.primaryBorderColor || H(this.primaryColor, this.darkMode), this.secondaryBorderColor = this.secondaryBorderColor || H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = this.tertiaryBorderColor || H(this.tertiaryColor, this.darkMode), this.noteBorderColor = this.noteBorderColor || H(this.noteBkgColor, this.darkMode), this.noteBkgColor = this.noteBkgColor || `#fff5ad`, this.noteTextColor = this.noteTextColor || `#333`, this.secondaryTextColor = this.secondaryTextColor || R(this.secondaryColor), this.tertiaryTextColor = this.tertiaryTextColor || R(this.tertiaryColor), this.lineColor = this.lineColor || R(this.background), this.arrowheadColor = this.arrowheadColor || R(this.background), this.textColor = this.textColor || this.primaryTextColor, this.border2 = this.border2 || this.tertiaryBorderColor, this.nodeBkg = this.nodeBkg || this.primaryColor, this.mainBkg = this.mainBkg || this.primaryColor, this.nodeBorder = this.nodeBorder || this.primaryBorderColor, this.clusterBkg = this.clusterBkg || this.tertiaryColor, this.clusterBorder = this.clusterBorder || this.tertiaryBorderColor, this.defaultLinkColor = this.defaultLinkColor || this.lineColor, this.titleColor = this.titleColor || this.tertiaryTextColor, this.edgeLabelBackground = this.edgeLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.nodeTextColor = this.nodeTextColor || this.primaryTextColor, this.actorBorder = this.actorBorder || this.primaryBorderColor, this.actorBkg = this.actorBkg || this.mainBkg, this.actorTextColor = this.actorTextColor || this.primaryTextColor, this.actorLineColor = this.actorLineColor || this.actorBorder, this.labelBoxBkgColor = this.labelBoxBkgColor || this.actorBkg, this.signalColor = this.signalColor || this.textColor, this.signalTextColor = this.signalTextColor || this.textColor, this.labelBoxBorderColor = this.labelBoxBorderColor || this.actorBorder, this.labelTextColor = this.labelTextColor || this.actorTextColor, this.loopTextColor = this.loopTextColor || this.actorTextColor, this.activationBorderColor = this.activationBorderColor || F(this.secondaryColor, 10), this.activationBkgColor = this.activationBkgColor || this.secondaryColor, this.sequenceNumberColor = this.sequenceNumberColor || R(this.lineColor), this.rectBkgColor = this.rectBkgColor || this.tertiaryColor, this.sectionBkgColor = this.sectionBkgColor || this.tertiaryColor, this.altSectionBkgColor = this.altSectionBkgColor || `white`, this.sectionBkgColor = this.sectionBkgColor || this.secondaryColor, this.sectionBkgColor2 = this.sectionBkgColor2 || this.primaryColor, this.excludeBkgColor = this.excludeBkgColor || `#eeeeee`, this.taskBorderColor = this.taskBorderColor || this.primaryBorderColor, this.taskBkgColor = this.taskBkgColor || this.primaryColor, this.activeTaskBorderColor = this.activeTaskBorderColor || this.primaryColor, this.activeTaskBkgColor = this.activeTaskBkgColor || P(this.primaryColor, 23), this.gridColor = this.gridColor || `lightgrey`, this.doneTaskBkgColor = this.doneTaskBkgColor || `lightgrey`, this.doneTaskBorderColor = this.doneTaskBorderColor || `grey`, this.critBorderColor = this.critBorderColor || `#ff8888`, this.critBkgColor = this.critBkgColor || `red`, this.todayLineColor = this.todayLineColor || `red`, this.vertLineColor = this.vertLineColor || `navy`, this.taskTextColor = this.taskTextColor || this.textColor, this.taskTextOutsideColor = this.taskTextOutsideColor || this.textColor, this.taskTextLightColor = this.taskTextLightColor || this.textColor, this.taskTextColor = this.taskTextColor || this.primaryTextColor, this.taskTextDarkColor = this.taskTextDarkColor || this.textColor, this.taskTextClickableColor = this.taskTextClickableColor || `#003163`, this.noteFontWeight = this.noteFontWeight || `normal`, this.fontWeight = this.fontWeight || `normal`, this.personBorder = this.personBorder || this.primaryBorderColor, this.personBkg = this.personBkg || this.mainBkg, this.darkMode ? (this.rowOdd = this.rowOdd || F(this.mainBkg, 5) || `#ffffff`, this.rowEven = this.rowEven || F(this.mainBkg, 10)) : (this.rowOdd = this.rowOdd || P(this.mainBkg, 75) || `#ffffff`, this.rowEven = this.rowEven || P(this.mainBkg, 5)), this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || this.tertiaryColor, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.nodeBorder, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.specialStateColor = this.lineColor, this.cScale0 = this.cScale0 || this.primaryColor, this.cScale1 = this.cScale1 || this.secondaryColor, this.cScale2 = this.cScale2 || this.tertiaryColor, this.cScale3 = this.cScale3 || I(this.primaryColor, {
                h: 30
            }), this.cScale4 = this.cScale4 || I(this.primaryColor, {
                h: 60
            }), this.cScale5 = this.cScale5 || I(this.primaryColor, {
                h: 90
            }), this.cScale6 = this.cScale6 || I(this.primaryColor, {
                h: 120
            }), this.cScale7 = this.cScale7 || I(this.primaryColor, {
                h: 150
            }), this.cScale8 = this.cScale8 || I(this.primaryColor, {
                h: 210,
                l: 150
            }), this.cScale9 = this.cScale9 || I(this.primaryColor, {
                h: 270
            }), this.cScale10 = this.cScale10 || I(this.primaryColor, {
                h: 300
            }), this.cScale11 = this.cScale11 || I(this.primaryColor, {
                h: 330
            }), this.darkMode) for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 75);
            else for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 25);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleInv` + e] = this[`cScaleInv` + e] || R(this[`cScale` + e]);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this.darkMode ? this[`cScalePeer` + e] = this[`cScalePeer` + e] || P(this[`cScale` + e], 10) : this[`cScalePeer` + e] = this[`cScalePeer` + e] || F(this[`cScale` + e], 10);
            this.scaleLabelColor = this.scaleLabelColor || this.labelTextColor;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleLabel` + e] = this[`cScaleLabel` + e] || this.scaleLabelColor;
            let e = this.darkMode ? -4 : -1;
            for(let t = 0; t < 5; t++)this[`surface` + t] = this[`surface` + t] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: e * (5 + t * 3)
            }), this[`surfacePeer` + t] = this[`surfacePeer` + t] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: e * (8 + t * 3)
            });
            this.classText = this.classText || this.textColor, this.fillType0 = this.fillType0 || this.primaryColor, this.fillType1 = this.fillType1 || this.secondaryColor, this.fillType2 = this.fillType2 || I(this.primaryColor, {
                h: 64
            }), this.fillType3 = this.fillType3 || I(this.secondaryColor, {
                h: 64
            }), this.fillType4 = this.fillType4 || I(this.primaryColor, {
                h: -64
            }), this.fillType5 = this.fillType5 || I(this.secondaryColor, {
                h: -64
            }), this.fillType6 = this.fillType6 || I(this.primaryColor, {
                h: 128
            }), this.fillType7 = this.fillType7 || I(this.secondaryColor, {
                h: 128
            }), this.pie1 = this.pie1 || this.primaryColor, this.pie2 = this.pie2 || this.secondaryColor, this.pie3 = this.pie3 || this.tertiaryColor, this.pie4 = this.pie4 || I(this.primaryColor, {
                l: -10
            }), this.pie5 = this.pie5 || I(this.secondaryColor, {
                l: -10
            }), this.pie6 = this.pie6 || I(this.tertiaryColor, {
                l: -10
            }), this.pie7 = this.pie7 || I(this.primaryColor, {
                h: 60,
                l: -10
            }), this.pie8 = this.pie8 || I(this.primaryColor, {
                h: -60,
                l: -10
            }), this.pie9 = this.pie9 || I(this.primaryColor, {
                h: 120,
                l: 0
            }), this.pie10 = this.pie10 || I(this.primaryColor, {
                h: 60,
                l: -20
            }), this.pie11 = this.pie11 || I(this.primaryColor, {
                h: -60,
                l: -20
            }), this.pie12 = this.pie12 || I(this.primaryColor, {
                h: 120,
                l: -10
            }), this.pieTitleTextSize = this.pieTitleTextSize || `25px`, this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || `17px`, this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || `17px`, this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || `black`, this.pieStrokeWidth = this.pieStrokeWidth || `2px`, this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || `2px`, this.pieOuterStrokeColor = this.pieOuterStrokeColor || `black`, this.pieOpacity = this.pieOpacity || `0.7`, this.venn1 = this.venn1 ?? I(this.primaryColor, {
                l: -30
            }), this.venn2 = this.venn2 ?? I(this.secondaryColor, {
                l: -30
            }), this.venn3 = this.venn3 ?? I(this.tertiaryColor, {
                l: -30
            }), this.venn4 = this.venn4 ?? I(this.primaryColor, {
                h: 60,
                l: -30
            }), this.venn5 = this.venn5 ?? I(this.primaryColor, {
                h: -60,
                l: -30
            }), this.venn6 = this.venn6 ?? I(this.secondaryColor, {
                h: 60,
                l: -30
            }), this.venn7 = this.venn7 ?? I(this.primaryColor, {
                h: 120,
                l: -30
            }), this.venn8 = this.venn8 ?? I(this.secondaryColor, {
                h: 120,
                l: -30
            }), this.vennTitleTextColor = this.vennTitleTextColor ?? this.titleColor, this.vennSetTextColor = this.vennSetTextColor ?? this.textColor, this.cynefin = {
                domainFontSize: this.cynefin?.domainFontSize || 16,
                itemFontSize: this.cynefin?.itemFontSize || 12,
                boundaryColor: this.cynefin?.boundaryColor || this.lineColor,
                boundaryWidth: this.cynefin?.boundaryWidth || 2,
                cliffColor: this.cynefin?.cliffColor || `#8B0000`,
                cliffWidth: this.cynefin?.cliffWidth || 4,
                arrowColor: this.cynefin?.arrowColor || this.lineColor,
                arrowWidth: this.cynefin?.arrowWidth || 2,
                complexBg: this.cynefin?.complexBg || `#E8F5E9`,
                complicatedBg: this.cynefin?.complicatedBg || `#E3F2FD`,
                chaoticBg: this.cynefin?.chaoticBg || `#FBE9E7`,
                clearBg: this.cynefin?.clearBg || `#FFF8E1`,
                confusionBg: this.cynefin?.confusionBg || `#F3E5F5`,
                textColor: this.cynefin?.textColor || this.textColor,
                labelColor: this.cynefin?.labelColor || this.primaryTextColor
            }, this.radar = {
                axisColor: this.radar?.axisColor || this.lineColor,
                axisStrokeWidth: this.radar?.axisStrokeWidth || 2,
                axisLabelFontSize: this.radar?.axisLabelFontSize || 12,
                curveOpacity: this.radar?.curveOpacity || .5,
                curveStrokeWidth: this.radar?.curveStrokeWidth || 2,
                graticuleColor: this.radar?.graticuleColor || `#DEDEDE`,
                graticuleStrokeWidth: this.radar?.graticuleStrokeWidth || 1,
                graticuleOpacity: this.radar?.graticuleOpacity || .3,
                legendBoxSize: this.radar?.legendBoxSize || 12,
                legendFontSize: this.radar?.legendFontSize || 12
            }, this.wardleyEvolutionColor = this.wardleyEvolutionColor || `#dc3545`, this.wardley = {
                backgroundColor: this.wardley?.backgroundColor || this.background,
                axisColor: this.wardley?.axisColor || this.lineColor,
                axisTextColor: this.wardley?.axisTextColor || this.primaryTextColor,
                gridColor: this.wardley?.gridColor || this.gridColor,
                componentFill: this.wardley?.componentFill || this.background,
                componentStroke: this.wardley?.componentStroke || this.lineColor,
                componentLabelColor: this.wardley?.componentLabelColor || this.primaryTextColor,
                linkStroke: this.wardley?.linkStroke || this.lineColor,
                evolutionStroke: this.wardley?.evolutionStroke || this.wardleyEvolutionColor,
                annotationStroke: this.wardley?.annotationStroke || this.lineColor,
                annotationTextColor: this.wardley?.annotationTextColor || this.primaryTextColor,
                annotationFill: this.wardley?.annotationFill || this.background
            }, this.archEdgeColor = this.archEdgeColor || `#777`, this.archEdgeArrowColor = this.archEdgeArrowColor || `#777`, this.archEdgeWidth = this.archEdgeWidth || `3`, this.archGroupBorderColor = this.archGroupBorderColor || `#000`, this.archGroupBorderWidth = this.archGroupBorderWidth || `2px`, this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || I(this.primaryColor, {
                r: 5,
                g: 5,
                b: 5
            }), this.quadrant3Fill = this.quadrant3Fill || I(this.primaryColor, {
                r: 10,
                g: 10,
                b: 10
            }), this.quadrant4Fill = this.quadrant4Fill || I(this.primaryColor, {
                r: 15,
                g: 15,
                b: 15
            }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || I(this.primaryTextColor, {
                r: -5,
                g: -5,
                b: -5
            }), this.quadrant3TextFill = this.quadrant3TextFill || I(this.primaryTextColor, {
                r: -10,
                g: -10,
                b: -10
            }), this.quadrant4TextFill = this.quadrant4TextFill || I(this.primaryTextColor, {
                r: -15,
                g: -15,
                b: -15
            }), this.quadrantPointFill = this.quadrantPointFill || M(this.quadrant1Fill) ? P(this.quadrant1Fill) : F(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
                backgroundColor: this.xyChart?.backgroundColor || this.background,
                titleColor: this.xyChart?.titleColor || this.primaryTextColor,
                dataLabelColor: this.xyChart?.dataLabelColor || this.primaryTextColor,
                legendTextColor: this.xyChart?.legendTextColor || this.primaryTextColor,
                xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
                xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
                xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
                xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
                yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
                yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
                yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
                yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
                plotColorPalette: this.xyChart?.plotColorPalette || `#FFF4DD,#FFD8B1,#FFA07A,#ECEFF1,#D6DBDF,#C3E0A8,#FFB6A4,#FFD74D,#738FA7,#FFFFF0`
            }, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || `1`, this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = this.git0 || this.primaryColor, this.git1 = this.git1 || this.secondaryColor, this.git2 = this.git2 || this.tertiaryColor, this.git3 = this.git3 || I(this.primaryColor, {
                h: -30
            }), this.git4 = this.git4 || I(this.primaryColor, {
                h: -60
            }), this.git5 = this.git5 || I(this.primaryColor, {
                h: -90
            }), this.git6 = this.git6 || I(this.primaryColor, {
                h: 60
            }), this.git7 = this.git7 || I(this.primaryColor, {
                h: 120
            }), this.darkMode ? (this.git0 = P(this.git0, 25), this.git1 = P(this.git1, 25), this.git2 = P(this.git2, 25), this.git3 = P(this.git3, 25), this.git4 = P(this.git4, 25), this.git5 = P(this.git5, 25), this.git6 = P(this.git6, 25), this.git7 = P(this.git7, 25)) : (this.git0 = F(this.git0, 25), this.git1 = F(this.git1, 25), this.git2 = F(this.git2, 25), this.git3 = F(this.git3, 25), this.git4 = F(this.git4, 25), this.git5 = F(this.git5, 25), this.git6 = F(this.git6, 25), this.git7 = F(this.git7, 25)), this.gitInv0 = this.gitInv0 || R(this.git0), this.gitInv1 = this.gitInv1 || R(this.git1), this.gitInv2 = this.gitInv2 || R(this.git2), this.gitInv3 = this.gitInv3 || R(this.git3), this.gitInv4 = this.gitInv4 || R(this.git4), this.gitInv5 = this.gitInv5 || R(this.git5), this.gitInv6 = this.gitInv6 || R(this.git6), this.gitInv7 = this.gitInv7 || R(this.git7), this.branchLabelColor = this.branchLabelColor || (this.darkMode ? `black` : this.labelTextColor), this.gitBranchLabel0 = this.gitBranchLabel0 || this.branchLabelColor, this.gitBranchLabel1 = this.gitBranchLabel1 || this.branchLabelColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.branchLabelColor, this.gitBranchLabel3 = this.gitBranchLabel3 || this.branchLabelColor, this.gitBranchLabel4 = this.gitBranchLabel4 || this.branchLabelColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.branchLabelColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.branchLabelColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.branchLabelColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || `10px`, this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || `10px`, this.emUiFill = this.emUiFill || `white`, this.emUiStroke = this.emUiStroke || `#dbdada`, this.emProcessorFill = this.emProcessorFill || `#edb3f6`, this.emProcessorStroke = this.emProcessorStroke || `#b88cbf`, this.emReadModelFill = this.emReadModelFill || `#d3f1a2`, this.emReadModelStroke = this.emReadModelStroke || `#a3b732`, this.emCommandFill = this.emCommandFill || `#bcd6fe`, this.emCommandStroke = this.emCommandStroke || `#679ac3`, this.emEventFill = this.emEventFill || `#ffb778`, this.emEventStroke = this.emEventStroke || `#c19a0f`, this.emSwimlaneBackgroundOdd = this.emSwimlaneBackgroundOdd || `rgb(250,250,250)`, this.emSwimlaneBackgroundStroke = this.emSwimlaneBackgroundStroke || `rgb(240,240,240)`, this.emArrowhead = this.emArrowhead || this.lineColor, this.emRelationStroke = this.emRelationStroke || this.lineColor, this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || B, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || V, this.gradientStart = this.primaryBorderColor, this.gradientStop = this.secondaryBorderColor;
        }
        calculate(e) {
            if (typeof e != `object`) {
                this.updateColors();
                return;
            }
            let t = Object.keys(e);
            t.forEach((t)=>{
                this[t] = e[t];
            }), this.updateColors(), t.forEach((t)=>{
                this[t] = e[t];
            });
        }
    };
    U = t((e)=>{
        let t = new xt;
        return t.calculate(e), t;
    }, `getThemeVariables`);
    St = class {
        static{
            t(this, `Theme`);
        }
        constructor(){
            this.background = `#333`, this.primaryColor = `#1f2020`, this.secondaryColor = P(this.primaryColor, 16), this.tertiaryColor = I(this.primaryColor, {
                h: -160
            }), this.primaryBorderColor = R(this.background), this.secondaryBorderColor = H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = H(this.tertiaryColor, this.darkMode), this.primaryTextColor = R(this.primaryColor), this.secondaryTextColor = R(this.secondaryColor), this.tertiaryTextColor = R(this.tertiaryColor), this.lineColor = R(this.background), this.textColor = R(this.background), this.mainBkg = `#1f2020`, this.secondBkg = `calculated`, this.mainContrastColor = `lightgrey`, this.darkTextColor = P(R(`#323D47`), 10), this.lineColor = `calculated`, this.border1 = `#ccc`, this.border2 = j(255, 255, 255, .25), this.arrowheadColor = `calculated`, this.fontFamily = `"trebuchet ms", verdana, arial, sans-serif`, this.fontSize = `16px`, this.labelBackground = `#181818`, this.textColor = `#ccc`, this.THEME_COLOR_LIMIT = 12, this.radius = 5, this.strokeWidth = 1, this.nodeBkg = `calculated`, this.nodeBorder = `calculated`, this.clusterBkg = `calculated`, this.clusterBorder = `calculated`, this.defaultLinkColor = `calculated`, this.titleColor = `#F9FFFE`, this.edgeLabelBackground = `calculated`, this.actorBorder = `calculated`, this.actorBkg = `calculated`, this.actorTextColor = `calculated`, this.actorLineColor = `calculated`, this.signalColor = `calculated`, this.signalTextColor = `calculated`, this.labelBoxBkgColor = `calculated`, this.labelBoxBorderColor = `calculated`, this.labelTextColor = `calculated`, this.loopTextColor = `calculated`, this.noteBorderColor = `calculated`, this.noteBkgColor = `#fff5ad`, this.noteTextColor = `calculated`, this.activationBorderColor = `calculated`, this.activationBkgColor = `calculated`, this.sequenceNumberColor = `black`, this.clusterBkg = `#302F3D`, this.sectionBkgColor = F(`#EAE8D9`, 30), this.altSectionBkgColor = `calculated`, this.sectionBkgColor2 = `#EAE8D9`, this.excludeBkgColor = F(this.sectionBkgColor, 10), this.taskBorderColor = j(255, 255, 255, 70), this.taskBkgColor = `calculated`, this.taskTextColor = `calculated`, this.taskTextLightColor = `calculated`, this.taskTextOutsideColor = `calculated`, this.taskTextClickableColor = `#003163`, this.activeTaskBorderColor = j(255, 255, 255, 50), this.activeTaskBkgColor = `#81B1DB`, this.gridColor = `calculated`, this.doneTaskBkgColor = `calculated`, this.doneTaskBorderColor = `grey`, this.critBorderColor = `#E83737`, this.critBkgColor = `#E83737`, this.taskTextDarkColor = `calculated`, this.todayLineColor = `#DB5757`, this.vertLineColor = `#00BFFF`, this.personBorder = this.primaryBorderColor, this.personBkg = this.mainBkg, this.archEdgeColor = `calculated`, this.archEdgeArrowColor = `calculated`, this.archEdgeWidth = `3`, this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = `2px`, this.rowOdd = this.rowOdd || P(this.mainBkg, 5) || `#ffffff`, this.rowEven = this.rowEven || F(this.mainBkg, 10), this.labelColor = `calculated`, this.errorBkgColor = `#a44141`, this.errorTextColor = `#ddd`, this.useGradient = !0, this.gradientStart = this.primaryBorderColor, this.gradientStop = this.secondaryBorderColor, this.dropShadow = `drop-shadow( 1px 2px 2px rgba(185,185,185,1))`, this.noteFontWeight = this.noteFontWeight || `normal`, this.fontWeight = this.fontWeight || `normal`;
        }
        updateColors() {
            this.secondBkg = P(this.mainBkg, 16), this.lineColor = this.mainContrastColor, this.arrowheadColor = this.mainContrastColor, this.nodeBkg = this.mainBkg, this.nodeBorder = this.border1, this.clusterBkg = this.secondBkg, this.clusterBorder = this.border2, this.defaultLinkColor = this.lineColor, this.edgeLabelBackground = P(this.labelBackground, 25), this.actorBorder = this.border1, this.actorBkg = this.mainBkg, this.actorTextColor = this.mainContrastColor, this.actorLineColor = this.actorBorder, this.signalColor = this.mainContrastColor, this.signalTextColor = this.mainContrastColor, this.labelBoxBkgColor = this.actorBkg, this.labelBoxBorderColor = this.actorBorder, this.labelTextColor = this.mainContrastColor, this.loopTextColor = this.mainContrastColor, this.noteBorderColor = this.secondaryBorderColor, this.noteBkgColor = this.secondBkg, this.noteTextColor = this.secondaryTextColor, this.activationBorderColor = this.border1, this.activationBkgColor = this.secondBkg, this.rectBkgColor = this.rectBkgColor || this.tertiaryColor, this.altSectionBkgColor = this.background, this.taskBkgColor = P(this.mainBkg, 23), this.taskTextColor = this.darkTextColor, this.taskTextLightColor = this.mainContrastColor, this.taskTextOutsideColor = this.taskTextLightColor, this.gridColor = this.mainContrastColor, this.doneTaskBkgColor = this.mainContrastColor, this.taskTextDarkColor = R(this.doneTaskBkgColor), this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || `#555`, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.primaryBorderColor, this.specialStateColor = `#f4f4f4`, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.fillType0 = this.primaryColor, this.fillType1 = this.secondaryColor, this.fillType2 = I(this.primaryColor, {
                h: 64
            }), this.fillType3 = I(this.secondaryColor, {
                h: 64
            }), this.fillType4 = I(this.primaryColor, {
                h: -64
            }), this.fillType5 = I(this.secondaryColor, {
                h: -64
            }), this.fillType6 = I(this.primaryColor, {
                h: 128
            }), this.fillType7 = I(this.secondaryColor, {
                h: 128
            }), this.cScale1 = this.cScale1 || `#0b0000`, this.cScale2 = this.cScale2 || `#4d1037`, this.cScale3 = this.cScale3 || `#3f5258`, this.cScale4 = this.cScale4 || `#4f2f1b`, this.cScale5 = this.cScale5 || `#6e0a0a`, this.cScale6 = this.cScale6 || `#3b0048`, this.cScale7 = this.cScale7 || `#995a01`, this.cScale8 = this.cScale8 || `#154706`, this.cScale9 = this.cScale9 || `#161722`, this.cScale10 = this.cScale10 || `#00296f`, this.cScale11 = this.cScale11 || `#01629c`, this.cScale12 = this.cScale12 || `#010029`, this.cScale0 = this.cScale0 || this.primaryColor, this.cScale1 = this.cScale1 || this.secondaryColor, this.cScale2 = this.cScale2 || this.tertiaryColor, this.cScale3 = this.cScale3 || I(this.primaryColor, {
                h: 30
            }), this.cScale4 = this.cScale4 || I(this.primaryColor, {
                h: 60
            }), this.cScale5 = this.cScale5 || I(this.primaryColor, {
                h: 90
            }), this.cScale6 = this.cScale6 || I(this.primaryColor, {
                h: 120
            }), this.cScale7 = this.cScale7 || I(this.primaryColor, {
                h: 150
            }), this.cScale8 = this.cScale8 || I(this.primaryColor, {
                h: 210
            }), this.cScale9 = this.cScale9 || I(this.primaryColor, {
                h: 270
            }), this.cScale10 = this.cScale10 || I(this.primaryColor, {
                h: 300
            }), this.cScale11 = this.cScale11 || I(this.primaryColor, {
                h: 330
            });
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleInv` + e] = this[`cScaleInv` + e] || R(this[`cScale` + e]);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScalePeer` + e] = this[`cScalePeer` + e] || P(this[`cScale` + e], 10);
            for(let e = 0; e < 5; e++)this[`surface` + e] = this[`surface` + e] || I(this.mainBkg, {
                h: 30,
                s: -30,
                l: -(-10 + e * 4)
            }), this[`surfacePeer` + e] = this[`surfacePeer` + e] || I(this.mainBkg, {
                h: 30,
                s: -30,
                l: -(-7 + e * 4)
            });
            this.scaleLabelColor = this.scaleLabelColor || (this.darkMode ? `black` : this.labelTextColor);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleLabel` + e] = this[`cScaleLabel` + e] || this.scaleLabelColor;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`pie` + e] = this[`cScale` + e];
            this.pieTitleTextSize = this.pieTitleTextSize || `25px`, this.pieTitleTextColor = this.pieTitleTextColor || this.mainContrastColor, this.pieSectionTextSize = this.pieSectionTextSize || `17px`, this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || `17px`, this.pieLegendTextColor = this.pieLegendTextColor || this.mainContrastColor, this.pieStrokeColor = this.pieStrokeColor || `black`, this.pieStrokeWidth = this.pieStrokeWidth || `2px`, this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || `2px`, this.pieOuterStrokeColor = this.pieOuterStrokeColor || `black`, this.pieOpacity = this.pieOpacity || `0.7`;
            for(let e = 0; e < 8; e++)this[`venn` + (e + 1)] = this[`venn` + (e + 1)] ?? P(this[`cScale` + e], 30);
            this.vennTitleTextColor = this.vennTitleTextColor ?? this.titleColor, this.vennSetTextColor = this.vennSetTextColor ?? this.textColor, this.cynefin = {
                domainFontSize: this.cynefin?.domainFontSize || 16,
                itemFontSize: this.cynefin?.itemFontSize || 12,
                boundaryColor: this.cynefin?.boundaryColor || this.lineColor,
                boundaryWidth: this.cynefin?.boundaryWidth || 2,
                cliffColor: this.cynefin?.cliffColor || `#FF6B6B`,
                cliffWidth: this.cynefin?.cliffWidth || 4,
                arrowColor: this.cynefin?.arrowColor || this.lineColor,
                arrowWidth: this.cynefin?.arrowWidth || 2,
                complexBg: this.cynefin?.complexBg || `#1B5E20`,
                complicatedBg: this.cynefin?.complicatedBg || `#0D47A1`,
                chaoticBg: this.cynefin?.chaoticBg || `#BF360C`,
                clearBg: this.cynefin?.clearBg || `#F57F17`,
                confusionBg: this.cynefin?.confusionBg || `#4A148C`,
                textColor: this.cynefin?.textColor || this.textColor,
                labelColor: this.cynefin?.labelColor || this.primaryTextColor
            }, this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || I(this.primaryColor, {
                r: 5,
                g: 5,
                b: 5
            }), this.quadrant3Fill = this.quadrant3Fill || I(this.primaryColor, {
                r: 10,
                g: 10,
                b: 10
            }), this.quadrant4Fill = this.quadrant4Fill || I(this.primaryColor, {
                r: 15,
                g: 15,
                b: 15
            }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || I(this.primaryTextColor, {
                r: -5,
                g: -5,
                b: -5
            }), this.quadrant3TextFill = this.quadrant3TextFill || I(this.primaryTextColor, {
                r: -10,
                g: -10,
                b: -10
            }), this.quadrant4TextFill = this.quadrant4TextFill || I(this.primaryTextColor, {
                r: -15,
                g: -15,
                b: -15
            }), this.quadrantPointFill = this.quadrantPointFill || M(this.quadrant1Fill) ? P(this.quadrant1Fill) : F(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
                backgroundColor: this.xyChart?.backgroundColor || this.background,
                titleColor: this.xyChart?.titleColor || this.primaryTextColor,
                dataLabelColor: this.xyChart?.dataLabelColor || this.primaryTextColor,
                legendTextColor: this.xyChart?.legendTextColor || this.primaryTextColor,
                xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
                xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
                xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
                xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
                yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
                yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
                yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
                yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
                plotColorPalette: this.xyChart?.plotColorPalette || `#3498db,#2ecc71,#e74c3c,#f1c40f,#bdc3c7,#ffffff,#34495e,#9b59b6,#1abc9c,#e67e22`
            }, this.packet = {
                startByteColor: this.primaryTextColor,
                endByteColor: this.primaryTextColor,
                labelColor: this.primaryTextColor,
                titleColor: this.primaryTextColor,
                blockStrokeColor: this.primaryTextColor,
                blockFillColor: this.background
            }, this.radar = {
                axisColor: this.radar?.axisColor || this.lineColor,
                axisStrokeWidth: this.radar?.axisStrokeWidth || 2,
                axisLabelFontSize: this.radar?.axisLabelFontSize || 12,
                curveOpacity: this.radar?.curveOpacity || .5,
                curveStrokeWidth: this.radar?.curveStrokeWidth || 2,
                graticuleColor: this.radar?.graticuleColor || `#DEDEDE`,
                graticuleStrokeWidth: this.radar?.graticuleStrokeWidth || 1,
                graticuleOpacity: this.radar?.graticuleOpacity || .3,
                legendBoxSize: this.radar?.legendBoxSize || 12,
                legendFontSize: this.radar?.legendFontSize || 12
            }, this.wardleyEvolutionColor = this.wardleyEvolutionColor || `#ff6b6b`, this.wardley = {
                backgroundColor: this.wardley?.backgroundColor || this.background,
                axisColor: this.wardley?.axisColor || this.lineColor,
                axisTextColor: this.wardley?.axisTextColor || this.primaryTextColor,
                gridColor: this.wardley?.gridColor || this.gridColor,
                componentFill: this.wardley?.componentFill || this.mainBkg,
                componentStroke: this.wardley?.componentStroke || this.lineColor,
                componentLabelColor: this.wardley?.componentLabelColor || this.primaryTextColor,
                linkStroke: this.wardley?.linkStroke || this.lineColor,
                evolutionStroke: this.wardley?.evolutionStroke || this.wardleyEvolutionColor,
                annotationStroke: this.wardley?.annotationStroke || this.lineColor,
                annotationTextColor: this.wardley?.annotationTextColor || this.primaryTextColor,
                annotationFill: this.wardley?.annotationFill || this.mainBkg
            }, this.classText = this.primaryTextColor, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || `1`, this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = P(this.secondaryColor, 20), this.git1 = P(this.pie2 || this.secondaryColor, 20), this.git2 = P(this.pie3 || this.tertiaryColor, 20), this.git3 = P(this.pie4 || I(this.primaryColor, {
                h: -30
            }), 20), this.git4 = P(this.pie5 || I(this.primaryColor, {
                h: -60
            }), 20), this.git5 = P(this.pie6 || I(this.primaryColor, {
                h: -90
            }), 10), this.git6 = P(this.pie7 || I(this.primaryColor, {
                h: 60
            }), 10), this.git7 = P(this.pie8 || I(this.primaryColor, {
                h: 120
            }), 20), this.gitInv0 = this.gitInv0 || R(this.git0), this.gitInv1 = this.gitInv1 || R(this.git1), this.gitInv2 = this.gitInv2 || R(this.git2), this.gitInv3 = this.gitInv3 || R(this.git3), this.gitInv4 = this.gitInv4 || R(this.git4), this.gitInv5 = this.gitInv5 || R(this.git5), this.gitInv6 = this.gitInv6 || R(this.git6), this.gitInv7 = this.gitInv7 || R(this.git7), this.gitBranchLabel0 = this.gitBranchLabel0 || R(this.labelTextColor), this.gitBranchLabel1 = this.gitBranchLabel1 || this.labelTextColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.labelTextColor, this.gitBranchLabel3 = this.gitBranchLabel3 || R(this.labelTextColor), this.gitBranchLabel4 = this.gitBranchLabel4 || this.labelTextColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.labelTextColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.labelTextColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.labelTextColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || `10px`, this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || `10px`, this.emUiFill = this.emUiFill || `#2d2d2d`, this.emUiStroke = this.emUiStroke || `#555`, this.emProcessorFill = this.emProcessorFill || P(`#5a3d5c`, 10), this.emProcessorStroke = this.emProcessorStroke || `#8a6d8c`, this.emReadModelFill = this.emReadModelFill || P(`#3d5a2d`, 10), this.emReadModelStroke = this.emReadModelStroke || `#6d8c5c`, this.emCommandFill = this.emCommandFill || P(`#2d3d5a`, 10), this.emCommandStroke = this.emCommandStroke || `#5c6d8c`, this.emEventFill = this.emEventFill || P(`#5a452d`, 10), this.emEventStroke = this.emEventStroke || `#8c755c`, this.emSwimlaneBackgroundOdd = this.emSwimlaneBackgroundOdd || P(this.background, 5), this.emSwimlaneBackgroundStroke = this.emSwimlaneBackgroundStroke || P(this.background, 12), this.emArrowhead = this.emArrowhead || this.lineColor, this.emRelationStroke = this.emRelationStroke || this.lineColor, this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || P(this.background, 12), this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || P(this.background, 2), this.nodeBorder = this.nodeBorder || `#999`;
        }
        calculate(e) {
            if (typeof e != `object`) {
                this.updateColors();
                return;
            }
            let t = Object.keys(e);
            t.forEach((t)=>{
                this[t] = e[t];
            }), this.updateColors(), t.forEach((t)=>{
                this[t] = e[t];
            });
        }
    };
    Ct = t((e)=>{
        let t = new St;
        return t.calculate(e), t;
    }, `getThemeVariables`);
    wt = class {
        static{
            t(this, `Theme`);
        }
        constructor(){
            this.background = `#f4f4f4`, this.primaryColor = `#ECECFF`, this.secondaryColor = I(this.primaryColor, {
                h: 120
            }), this.secondaryColor = `#ffffde`, this.tertiaryColor = I(this.primaryColor, {
                h: -160
            }), this.primaryBorderColor = H(this.primaryColor, this.darkMode), this.secondaryBorderColor = H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = H(this.tertiaryColor, this.darkMode), this.primaryTextColor = R(this.primaryColor), this.secondaryTextColor = R(this.secondaryColor), this.tertiaryTextColor = R(this.tertiaryColor), this.lineColor = R(this.background), this.textColor = R(this.background), this.background = `white`, this.mainBkg = `#ECECFF`, this.secondBkg = `#ffffde`, this.lineColor = `#333333`, this.border1 = `#9370DB`, this.primaryBorderColor = H(this.primaryColor, this.darkMode), this.border2 = `#aaaa33`, this.arrowheadColor = `#333333`, this.fontFamily = `"trebuchet ms", verdana, arial, sans-serif`, this.fontSize = `16px`, this.labelBackground = `rgba(232,232,232, 0.8)`, this.textColor = `#333`, this.THEME_COLOR_LIMIT = 12, this.radius = 5, this.strokeWidth = 1, this.nodeBkg = `calculated`, this.nodeBorder = `calculated`, this.clusterBkg = `calculated`, this.clusterBorder = `calculated`, this.defaultLinkColor = `calculated`, this.titleColor = `calculated`, this.edgeLabelBackground = `calculated`, this.actorBorder = `calculated`, this.actorBkg = `calculated`, this.actorTextColor = `black`, this.actorLineColor = `calculated`, this.signalColor = `calculated`, this.signalTextColor = `calculated`, this.labelBoxBkgColor = `calculated`, this.labelBoxBorderColor = `calculated`, this.labelTextColor = `calculated`, this.loopTextColor = `calculated`, this.noteBorderColor = `calculated`, this.noteBkgColor = `#fff5ad`, this.noteTextColor = `calculated`, this.activationBorderColor = `#666`, this.activationBkgColor = `#f4f4f4`, this.sequenceNumberColor = `white`, this.clusterBkg = `#FBFBFF`, this.sectionBkgColor = `calculated`, this.altSectionBkgColor = `calculated`, this.sectionBkgColor2 = `calculated`, this.excludeBkgColor = `#eeeeee`, this.taskBorderColor = `calculated`, this.taskBkgColor = `calculated`, this.taskTextLightColor = `calculated`, this.taskTextColor = this.taskTextLightColor, this.taskTextDarkColor = `calculated`, this.taskTextOutsideColor = this.taskTextDarkColor, this.taskTextClickableColor = `calculated`, this.activeTaskBorderColor = `calculated`, this.activeTaskBkgColor = `calculated`, this.gridColor = `calculated`, this.doneTaskBkgColor = `calculated`, this.doneTaskBorderColor = `calculated`, this.critBorderColor = `calculated`, this.critBkgColor = `calculated`, this.todayLineColor = `calculated`, this.vertLineColor = `calculated`, this.sectionBkgColor = j(102, 102, 255, .49), this.altSectionBkgColor = `white`, this.sectionBkgColor2 = `#fff400`, this.taskBorderColor = `#534fbc`, this.taskBkgColor = `#8a90dd`, this.taskTextLightColor = `white`, this.taskTextColor = `calculated`, this.taskTextDarkColor = `black`, this.taskTextOutsideColor = `calculated`, this.taskTextClickableColor = `#003163`, this.activeTaskBorderColor = `#534fbc`, this.activeTaskBkgColor = `#bfc7ff`, this.gridColor = `lightgrey`, this.doneTaskBkgColor = `lightgrey`, this.doneTaskBorderColor = `grey`, this.critBorderColor = `#ff8888`, this.critBkgColor = `red`, this.todayLineColor = `red`, this.vertLineColor = `navy`, this.noteFontWeight = this.noteFontWeight || `normal`, this.fontWeight = this.fontWeight || `normal`, this.personBorder = this.primaryBorderColor, this.personBkg = this.mainBkg, this.archEdgeColor = `calculated`, this.archEdgeArrowColor = `calculated`, this.archEdgeWidth = `3`, this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = `2px`, this.rowOdd = `calculated`, this.rowEven = `calculated`, this.labelColor = `black`, this.errorBkgColor = `#552222`, this.errorTextColor = `#552222`, this.useGradient = !1, this.gradientStart = this.primaryBorderColor, this.gradientStop = this.secondaryBorderColor, this.dropShadow = `drop-shadow(1px 2px 2px rgba(185, 185, 185, 1))`, this.updateColors();
        }
        updateColors() {
            this.cScale0 = this.cScale0 || this.primaryColor, this.cScale1 = this.cScale1 || this.secondaryColor, this.cScale2 = this.cScale2 || this.tertiaryColor, this.cScale3 = this.cScale3 || I(this.primaryColor, {
                h: 30
            }), this.cScale4 = this.cScale4 || I(this.primaryColor, {
                h: 60
            }), this.cScale5 = this.cScale5 || I(this.primaryColor, {
                h: 90
            }), this.cScale6 = this.cScale6 || I(this.primaryColor, {
                h: 120
            }), this.cScale7 = this.cScale7 || I(this.primaryColor, {
                h: 150
            }), this.cScale8 = this.cScale8 || I(this.primaryColor, {
                h: 210
            }), this.cScale9 = this.cScale9 || I(this.primaryColor, {
                h: 270
            }), this.cScale10 = this.cScale10 || I(this.primaryColor, {
                h: 300
            }), this.cScale11 = this.cScale11 || I(this.primaryColor, {
                h: 330
            }), this.cScalePeer1 = this.cScalePeer1 || F(this.secondaryColor, 45), this.cScalePeer2 = this.cScalePeer2 || F(this.tertiaryColor, 40);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 10), this[`cScalePeer` + e] = this[`cScalePeer` + e] || F(this[`cScale` + e], 25);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleInv` + e] = this[`cScaleInv` + e] || I(this[`cScale` + e], {
                h: 180
            });
            for(let e = 0; e < 5; e++)this[`surface` + e] = this[`surface` + e] || I(this.mainBkg, {
                h: 30,
                l: -(5 + e * 5)
            }), this[`surfacePeer` + e] = this[`surfacePeer` + e] || I(this.mainBkg, {
                h: 30,
                l: -(7 + e * 5)
            });
            if (this.scaleLabelColor = this.scaleLabelColor !== `calculated` && this.scaleLabelColor ? this.scaleLabelColor : this.labelTextColor, this.labelTextColor !== `calculated`) {
                this.cScaleLabel0 = this.cScaleLabel0 || R(this.labelTextColor), this.cScaleLabel3 = this.cScaleLabel3 || R(this.labelTextColor);
                for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleLabel` + e] = this[`cScaleLabel` + e] || this.labelTextColor;
            }
            this.nodeBkg = this.mainBkg, this.nodeBorder = this.border1, this.clusterBkg = this.secondBkg, this.clusterBorder = this.border2, this.defaultLinkColor = this.lineColor, this.titleColor = this.textColor, this.edgeLabelBackground = this.labelBackground, this.actorBorder = this.border1, this.actorBkg = this.mainBkg, this.labelBoxBkgColor = this.actorBkg, this.signalColor = this.textColor, this.signalTextColor = this.textColor, this.labelBoxBorderColor = this.actorBorder, this.labelTextColor = this.actorTextColor, this.loopTextColor = this.actorTextColor, this.noteBorderColor = this.border2, this.noteTextColor = this.actorTextColor, this.actorLineColor = this.actorBorder, this.rectBkgColor = this.rectBkgColor || this.tertiaryColor, this.taskTextColor = this.taskTextLightColor, this.taskTextOutsideColor = this.taskTextDarkColor, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.rowOdd = this.rowOdd || P(this.primaryColor, 75) || `#ffffff`, this.rowEven = this.rowEven || P(this.primaryColor, 1), this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || `#f0f0f0`, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.nodeBorder, this.specialStateColor = this.lineColor, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.classText = this.primaryTextColor, this.fillType0 = this.primaryColor, this.fillType1 = this.secondaryColor, this.fillType2 = I(this.primaryColor, {
                h: 64
            }), this.fillType3 = I(this.secondaryColor, {
                h: 64
            }), this.fillType4 = I(this.primaryColor, {
                h: -64
            }), this.fillType5 = I(this.secondaryColor, {
                h: -64
            }), this.fillType6 = I(this.primaryColor, {
                h: 128
            }), this.fillType7 = I(this.secondaryColor, {
                h: 128
            }), this.pie1 = this.pie1 || this.primaryColor, this.pie2 = this.pie2 || this.secondaryColor, this.pie3 = this.pie3 || I(this.tertiaryColor, {
                l: -40
            }), this.pie4 = this.pie4 || I(this.primaryColor, {
                l: -10
            }), this.pie5 = this.pie5 || I(this.secondaryColor, {
                l: -30
            }), this.pie6 = this.pie6 || I(this.tertiaryColor, {
                l: -20
            }), this.pie7 = this.pie7 || I(this.primaryColor, {
                h: 60,
                l: -20
            }), this.pie8 = this.pie8 || I(this.primaryColor, {
                h: -60,
                l: -40
            }), this.pie9 = this.pie9 || I(this.primaryColor, {
                h: 120,
                l: -40
            }), this.pie10 = this.pie10 || I(this.primaryColor, {
                h: 60,
                l: -40
            }), this.pie11 = this.pie11 || I(this.primaryColor, {
                h: -90,
                l: -40
            }), this.pie12 = this.pie12 || I(this.primaryColor, {
                h: 120,
                l: -30
            }), this.pieTitleTextSize = this.pieTitleTextSize || `25px`, this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || `17px`, this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || `17px`, this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || `black`, this.pieStrokeWidth = this.pieStrokeWidth || `2px`, this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || `2px`, this.pieOuterStrokeColor = this.pieOuterStrokeColor || `black`, this.pieOpacity = this.pieOpacity || `0.7`, this.venn1 = this.venn1 ?? I(this.primaryColor, {
                l: -30
            }), this.venn2 = this.venn2 ?? I(this.secondaryColor, {
                l: -30
            }), this.venn3 = this.venn3 ?? I(this.tertiaryColor, {
                l: -40
            }), this.venn4 = this.venn4 ?? I(this.primaryColor, {
                h: 60,
                l: -30
            }), this.venn5 = this.venn5 ?? I(this.primaryColor, {
                h: -60,
                l: -30
            }), this.venn6 = this.venn6 ?? I(this.secondaryColor, {
                h: 60,
                l: -30
            }), this.venn7 = this.venn7 ?? I(this.primaryColor, {
                h: 120,
                l: -30
            }), this.venn8 = this.venn8 ?? I(this.secondaryColor, {
                h: 120,
                l: -30
            }), this.vennTitleTextColor = this.vennTitleTextColor ?? this.titleColor, this.vennSetTextColor = this.vennSetTextColor ?? this.textColor, this.cynefin = {
                domainFontSize: this.cynefin?.domainFontSize || 16,
                itemFontSize: this.cynefin?.itemFontSize || 12,
                boundaryColor: this.cynefin?.boundaryColor || this.lineColor,
                boundaryWidth: this.cynefin?.boundaryWidth || 2,
                cliffColor: this.cynefin?.cliffColor || `#8B0000`,
                cliffWidth: this.cynefin?.cliffWidth || 4,
                arrowColor: this.cynefin?.arrowColor || this.lineColor,
                arrowWidth: this.cynefin?.arrowWidth || 2,
                complexBg: this.cynefin?.complexBg || `#E8F5E9`,
                complicatedBg: this.cynefin?.complicatedBg || `#E3F2FD`,
                chaoticBg: this.cynefin?.chaoticBg || `#FBE9E7`,
                clearBg: this.cynefin?.clearBg || `#FFF8E1`,
                confusionBg: this.cynefin?.confusionBg || `#F3E5F5`,
                textColor: this.cynefin?.textColor || this.textColor,
                labelColor: this.cynefin?.labelColor || this.primaryTextColor
            }, this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || I(this.primaryColor, {
                r: 5,
                g: 5,
                b: 5
            }), this.quadrant3Fill = this.quadrant3Fill || I(this.primaryColor, {
                r: 10,
                g: 10,
                b: 10
            }), this.quadrant4Fill = this.quadrant4Fill || I(this.primaryColor, {
                r: 15,
                g: 15,
                b: 15
            }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || I(this.primaryTextColor, {
                r: -5,
                g: -5,
                b: -5
            }), this.quadrant3TextFill = this.quadrant3TextFill || I(this.primaryTextColor, {
                r: -10,
                g: -10,
                b: -10
            }), this.quadrant4TextFill = this.quadrant4TextFill || I(this.primaryTextColor, {
                r: -15,
                g: -15,
                b: -15
            }), this.quadrantPointFill = this.quadrantPointFill || M(this.quadrant1Fill) ? P(this.quadrant1Fill) : F(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.radar = {
                axisColor: this.radar?.axisColor || this.lineColor,
                axisStrokeWidth: this.radar?.axisStrokeWidth || 2,
                axisLabelFontSize: this.radar?.axisLabelFontSize || 12,
                curveOpacity: this.radar?.curveOpacity || .5,
                curveStrokeWidth: this.radar?.curveStrokeWidth || 2,
                graticuleColor: this.radar?.graticuleColor || `#DEDEDE`,
                graticuleStrokeWidth: this.radar?.graticuleStrokeWidth || 1,
                graticuleOpacity: this.radar?.graticuleOpacity || .3,
                legendBoxSize: this.radar?.legendBoxSize || 12,
                legendFontSize: this.radar?.legendFontSize || 12
            }, this.wardleyEvolutionColor = this.wardleyEvolutionColor || `#dc3545`, this.wardley = {
                backgroundColor: this.wardley?.backgroundColor || this.background,
                axisColor: this.wardley?.axisColor || this.lineColor,
                axisTextColor: this.wardley?.axisTextColor || this.primaryTextColor,
                gridColor: this.wardley?.gridColor || this.gridColor,
                componentFill: this.wardley?.componentFill || this.background,
                componentStroke: this.wardley?.componentStroke || this.lineColor,
                componentLabelColor: this.wardley?.componentLabelColor || this.primaryTextColor,
                linkStroke: this.wardley?.linkStroke || this.lineColor,
                evolutionStroke: this.wardley?.evolutionStroke || this.wardleyEvolutionColor,
                annotationStroke: this.wardley?.annotationStroke || this.lineColor,
                annotationTextColor: this.wardley?.annotationTextColor || this.primaryTextColor,
                annotationFill: this.wardley?.annotationFill || this.background
            }, this.xyChart = {
                backgroundColor: this.xyChart?.backgroundColor || this.background,
                titleColor: this.xyChart?.titleColor || this.primaryTextColor,
                dataLabelColor: this.xyChart?.dataLabelColor || this.primaryTextColor,
                legendTextColor: this.xyChart?.legendTextColor || this.primaryTextColor,
                xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
                xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
                xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
                xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
                yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
                yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
                yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
                yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
                plotColorPalette: this.xyChart?.plotColorPalette || `#ECECFF,#8493A6,#FFC3A0,#DCDDE1,#B8E994,#D1A36F,#C3CDE6,#FFB6C1,#496078,#F8F3E3`
            }, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || `1`, this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || this.labelBackground, this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = this.git0 || this.primaryColor, this.git1 = this.git1 || this.secondaryColor, this.git2 = this.git2 || this.tertiaryColor, this.git3 = this.git3 || I(this.primaryColor, {
                h: -30
            }), this.git4 = this.git4 || I(this.primaryColor, {
                h: -60
            }), this.git5 = this.git5 || I(this.primaryColor, {
                h: -90
            }), this.git6 = this.git6 || I(this.primaryColor, {
                h: 60
            }), this.git7 = this.git7 || I(this.primaryColor, {
                h: 120
            }), this.darkMode ? (this.git0 = P(this.git0, 25), this.git1 = P(this.git1, 25), this.git2 = P(this.git2, 25), this.git3 = P(this.git3, 25), this.git4 = P(this.git4, 25), this.git5 = P(this.git5, 25), this.git6 = P(this.git6, 25), this.git7 = P(this.git7, 25)) : (this.git0 = F(this.git0, 25), this.git1 = F(this.git1, 25), this.git2 = F(this.git2, 25), this.git3 = F(this.git3, 25), this.git4 = F(this.git4, 25), this.git5 = F(this.git5, 25), this.git6 = F(this.git6, 25), this.git7 = F(this.git7, 25)), this.gitInv0 = this.gitInv0 || F(R(this.git0), 25), this.gitInv1 = this.gitInv1 || R(this.git1), this.gitInv2 = this.gitInv2 || R(this.git2), this.gitInv3 = this.gitInv3 || R(this.git3), this.gitInv4 = this.gitInv4 || R(this.git4), this.gitInv5 = this.gitInv5 || R(this.git5), this.gitInv6 = this.gitInv6 || R(this.git6), this.gitInv7 = this.gitInv7 || R(this.git7), this.gitBranchLabel0 = this.gitBranchLabel0 || R(this.labelTextColor), this.gitBranchLabel1 = this.gitBranchLabel1 || this.labelTextColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.labelTextColor, this.gitBranchLabel3 = this.gitBranchLabel3 || R(this.labelTextColor), this.gitBranchLabel4 = this.gitBranchLabel4 || this.labelTextColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.labelTextColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.labelTextColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.labelTextColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || `10px`, this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || `10px`, this.emUiFill = this.emUiFill || `white`, this.emUiStroke = this.emUiStroke || `#dbdada`, this.emProcessorFill = this.emProcessorFill || `#edb3f6`, this.emProcessorStroke = this.emProcessorStroke || `#b88cbf`, this.emReadModelFill = this.emReadModelFill || `#d3f1a2`, this.emReadModelStroke = this.emReadModelStroke || `#a3b732`, this.emCommandFill = this.emCommandFill || `#bcd6fe`, this.emCommandStroke = this.emCommandStroke || `#679ac3`, this.emEventFill = this.emEventFill || `#ffb778`, this.emEventStroke = this.emEventStroke || `#c19a0f`, this.emSwimlaneBackgroundOdd = this.emSwimlaneBackgroundOdd || `rgb(250,250,250)`, this.emSwimlaneBackgroundStroke = this.emSwimlaneBackgroundStroke || `rgb(240,240,240)`, this.emArrowhead = this.emArrowhead || this.lineColor, this.emRelationStroke = this.emRelationStroke || this.lineColor, this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || B, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || V;
        }
        calculate(e) {
            if (Object.keys(this).forEach((e)=>{
                this[e] === `calculated` && (this[e] = void 0);
            }), typeof e != `object`) {
                this.updateColors();
                return;
            }
            let t = Object.keys(e);
            t.forEach((t)=>{
                this[t] = e[t];
            }), this.updateColors(), t.forEach((t)=>{
                this[t] = e[t];
            });
        }
    };
    Tt = t((e)=>{
        let t = new wt;
        return t.calculate(e), t;
    }, `getThemeVariables`);
    Et = class {
        static{
            t(this, `Theme`);
        }
        constructor(){
            this.background = `#f4f4f4`, this.primaryColor = `#cde498`, this.secondaryColor = `#cdffb2`, this.background = `white`, this.mainBkg = `#cde498`, this.secondBkg = `#cdffb2`, this.lineColor = `green`, this.border1 = `#13540c`, this.border2 = `#6eaa49`, this.arrowheadColor = `green`, this.fontFamily = `"trebuchet ms", verdana, arial, sans-serif`, this.fontSize = `16px`, this.tertiaryColor = P(`#cde498`, 10), this.primaryBorderColor = H(this.primaryColor, this.darkMode), this.secondaryBorderColor = H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = H(this.tertiaryColor, this.darkMode), this.primaryTextColor = R(this.primaryColor), this.secondaryTextColor = R(this.secondaryColor), this.tertiaryTextColor = R(this.primaryColor), this.lineColor = R(this.background), this.textColor = R(this.background), this.THEME_COLOR_LIMIT = 12, this.radius = 5, this.strokeWidth = 1, this.nodeBkg = `calculated`, this.nodeBorder = `calculated`, this.clusterBkg = `calculated`, this.clusterBorder = `calculated`, this.defaultLinkColor = `calculated`, this.titleColor = `#333`, this.edgeLabelBackground = `#e8e8e8`, this.actorBorder = `calculated`, this.actorBkg = `calculated`, this.actorTextColor = `black`, this.actorLineColor = `calculated`, this.signalColor = `#333`, this.signalTextColor = `#333`, this.labelBoxBkgColor = `calculated`, this.labelBoxBorderColor = `#326932`, this.labelTextColor = `calculated`, this.loopTextColor = `calculated`, this.noteBorderColor = `calculated`, this.noteBkgColor = `#fff5ad`, this.noteTextColor = `calculated`, this.activationBorderColor = `#666`, this.activationBkgColor = `#f4f4f4`, this.sequenceNumberColor = `white`, this.sectionBkgColor = `#6eaa49`, this.altSectionBkgColor = `white`, this.sectionBkgColor2 = `#6eaa49`, this.excludeBkgColor = `#eeeeee`, this.taskBorderColor = `calculated`, this.taskBkgColor = `#487e3a`, this.taskTextLightColor = `white`, this.taskTextColor = `calculated`, this.taskTextDarkColor = `black`, this.taskTextOutsideColor = `calculated`, this.taskTextClickableColor = `#003163`, this.activeTaskBorderColor = `calculated`, this.activeTaskBkgColor = `calculated`, this.gridColor = `lightgrey`, this.doneTaskBkgColor = `lightgrey`, this.doneTaskBorderColor = `grey`, this.critBorderColor = `#ff8888`, this.critBkgColor = `red`, this.todayLineColor = `red`, this.vertLineColor = `#00BFFF`, this.personBorder = this.primaryBorderColor, this.personBkg = this.mainBkg, this.archEdgeColor = `calculated`, this.archEdgeArrowColor = `calculated`, this.archEdgeWidth = `3`, this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = `2px`, this.noteFontWeight = `normal`, this.fontWeight = `normal`, this.labelColor = `black`, this.errorBkgColor = `#552222`, this.errorTextColor = `#552222`, this.useGradient = !0, this.gradientStart = this.primaryBorderColor, this.gradientStop = this.secondaryBorderColor, this.dropShadow = `drop-shadow( 1px 2px 2px rgba(185,185,185,0.5))`;
        }
        updateColors() {
            this.actorBorder = F(this.mainBkg, 20), this.actorBkg = this.mainBkg, this.labelBoxBkgColor = this.actorBkg, this.labelTextColor = this.actorTextColor, this.loopTextColor = this.actorTextColor, this.noteBorderColor = this.border2, this.noteTextColor = this.actorTextColor, this.actorLineColor = this.actorBorder, this.rectBkgColor = this.rectBkgColor || this.tertiaryColor, this.cScale0 = this.cScale0 || this.primaryColor, this.cScale1 = this.cScale1 || this.secondaryColor, this.cScale2 = this.cScale2 || this.tertiaryColor, this.cScale3 = this.cScale3 || I(this.primaryColor, {
                h: 30
            }), this.cScale4 = this.cScale4 || I(this.primaryColor, {
                h: 60
            }), this.cScale5 = this.cScale5 || I(this.primaryColor, {
                h: 90
            }), this.cScale6 = this.cScale6 || I(this.primaryColor, {
                h: 120
            }), this.cScale7 = this.cScale7 || I(this.primaryColor, {
                h: 150
            }), this.cScale8 = this.cScale8 || I(this.primaryColor, {
                h: 210
            }), this.cScale9 = this.cScale9 || I(this.primaryColor, {
                h: 270
            }), this.cScale10 = this.cScale10 || I(this.primaryColor, {
                h: 300
            }), this.cScale11 = this.cScale11 || I(this.primaryColor, {
                h: 330
            }), this.cScalePeer1 = this.cScalePeer1 || F(this.secondaryColor, 45), this.cScalePeer2 = this.cScalePeer2 || F(this.tertiaryColor, 40);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 10), this[`cScalePeer` + e] = this[`cScalePeer` + e] || F(this[`cScale` + e], 25);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleInv` + e] = this[`cScaleInv` + e] || I(this[`cScale` + e], {
                h: 180
            });
            this.scaleLabelColor = this.scaleLabelColor !== `calculated` && this.scaleLabelColor ? this.scaleLabelColor : this.labelTextColor;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleLabel` + e] = this[`cScaleLabel` + e] || this.scaleLabelColor;
            for(let e = 0; e < 5; e++)this[`surface` + e] = this[`surface` + e] || I(this.mainBkg, {
                h: 30,
                s: -30,
                l: -(5 + e * 5)
            }), this[`surfacePeer` + e] = this[`surfacePeer` + e] || I(this.mainBkg, {
                h: 30,
                s: -30,
                l: -(8 + e * 5)
            });
            this.nodeBkg = this.mainBkg, this.nodeBorder = this.border1, this.clusterBkg = this.secondBkg, this.clusterBorder = this.border2, this.defaultLinkColor = this.lineColor, this.taskBorderColor = this.border1, this.taskTextColor = this.taskTextLightColor, this.taskTextOutsideColor = this.taskTextDarkColor, this.activeTaskBorderColor = this.taskBorderColor, this.activeTaskBkgColor = this.mainBkg, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.rowOdd = this.rowOdd || P(this.mainBkg, 75) || `#ffffff`, this.rowEven = this.rowEven || P(this.mainBkg, 20), this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || `#f0f0f0`, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.primaryBorderColor, this.specialStateColor = this.lineColor, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.classText = this.primaryTextColor, this.fillType0 = this.primaryColor, this.fillType1 = this.secondaryColor, this.fillType2 = I(this.primaryColor, {
                h: 64
            }), this.fillType3 = I(this.secondaryColor, {
                h: 64
            }), this.fillType4 = I(this.primaryColor, {
                h: -64
            }), this.fillType5 = I(this.secondaryColor, {
                h: -64
            }), this.fillType6 = I(this.primaryColor, {
                h: 128
            }), this.fillType7 = I(this.secondaryColor, {
                h: 128
            }), this.pie1 = this.pie1 || this.primaryColor, this.pie2 = this.pie2 || this.secondaryColor, this.pie3 = this.pie3 || this.tertiaryColor, this.pie4 = this.pie4 || I(this.primaryColor, {
                l: -30
            }), this.pie5 = this.pie5 || I(this.secondaryColor, {
                l: -30
            }), this.pie6 = this.pie6 || I(this.tertiaryColor, {
                h: 40,
                l: -40
            }), this.pie7 = this.pie7 || I(this.primaryColor, {
                h: 60,
                l: -10
            }), this.pie8 = this.pie8 || I(this.primaryColor, {
                h: -60,
                l: -10
            }), this.pie9 = this.pie9 || I(this.primaryColor, {
                h: 120,
                l: 0
            }), this.pie10 = this.pie10 || I(this.primaryColor, {
                h: 60,
                l: -50
            }), this.pie11 = this.pie11 || I(this.primaryColor, {
                h: -60,
                l: -50
            }), this.pie12 = this.pie12 || I(this.primaryColor, {
                h: 120,
                l: -50
            }), this.pieTitleTextSize = this.pieTitleTextSize || `25px`, this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || `17px`, this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || `17px`, this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || `black`, this.pieStrokeWidth = this.pieStrokeWidth || `2px`, this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || `2px`, this.pieOuterStrokeColor = this.pieOuterStrokeColor || `black`, this.pieOpacity = this.pieOpacity || `0.7`, this.venn1 = this.venn1 ?? I(this.primaryColor, {
                l: -30
            }), this.venn2 = this.venn2 ?? I(this.secondaryColor, {
                l: -30
            }), this.venn3 = this.venn3 ?? I(this.tertiaryColor, {
                l: -30
            }), this.venn4 = this.venn4 ?? I(this.primaryColor, {
                h: 60,
                l: -30
            }), this.venn5 = this.venn5 ?? I(this.primaryColor, {
                h: -60,
                l: -30
            }), this.venn6 = this.venn6 ?? I(this.secondaryColor, {
                h: 60,
                l: -30
            }), this.venn7 = this.venn7 ?? I(this.primaryColor, {
                h: 120,
                l: -30
            }), this.venn8 = this.venn8 ?? I(this.secondaryColor, {
                h: 120,
                l: -30
            }), this.vennTitleTextColor = this.vennTitleTextColor ?? this.titleColor, this.vennSetTextColor = this.vennSetTextColor ?? this.textColor, this.cynefin = {
                domainFontSize: this.cynefin?.domainFontSize || 16,
                itemFontSize: this.cynefin?.itemFontSize || 12,
                boundaryColor: this.cynefin?.boundaryColor || this.lineColor,
                boundaryWidth: this.cynefin?.boundaryWidth || 2,
                cliffColor: this.cynefin?.cliffColor || `#8B4513`,
                cliffWidth: this.cynefin?.cliffWidth || 4,
                arrowColor: this.cynefin?.arrowColor || this.lineColor,
                arrowWidth: this.cynefin?.arrowWidth || 2,
                complexBg: this.cynefin?.complexBg || `#C8E6C9`,
                complicatedBg: this.cynefin?.complicatedBg || `#DCEDC8`,
                chaoticBg: this.cynefin?.chaoticBg || `#FFE0B2`,
                clearBg: this.cynefin?.clearBg || `#FFF9C4`,
                confusionBg: this.cynefin?.confusionBg || `#D7CCC8`,
                textColor: this.cynefin?.textColor || this.textColor,
                labelColor: this.cynefin?.labelColor || this.primaryTextColor
            }, this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || I(this.primaryColor, {
                r: 5,
                g: 5,
                b: 5
            }), this.quadrant3Fill = this.quadrant3Fill || I(this.primaryColor, {
                r: 10,
                g: 10,
                b: 10
            }), this.quadrant4Fill = this.quadrant4Fill || I(this.primaryColor, {
                r: 15,
                g: 15,
                b: 15
            }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || I(this.primaryTextColor, {
                r: -5,
                g: -5,
                b: -5
            }), this.quadrant3TextFill = this.quadrant3TextFill || I(this.primaryTextColor, {
                r: -10,
                g: -10,
                b: -10
            }), this.quadrant4TextFill = this.quadrant4TextFill || I(this.primaryTextColor, {
                r: -15,
                g: -15,
                b: -15
            }), this.quadrantPointFill = this.quadrantPointFill || M(this.quadrant1Fill) ? P(this.quadrant1Fill) : F(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.packet = {
                startByteColor: this.primaryTextColor,
                endByteColor: this.primaryTextColor,
                labelColor: this.primaryTextColor,
                titleColor: this.primaryTextColor,
                blockStrokeColor: this.primaryTextColor,
                blockFillColor: this.mainBkg
            }, this.radar = {
                axisColor: this.radar?.axisColor || this.lineColor,
                axisStrokeWidth: this.radar?.axisStrokeWidth || 2,
                axisLabelFontSize: this.radar?.axisLabelFontSize || 12,
                curveOpacity: this.radar?.curveOpacity || .5,
                curveStrokeWidth: this.radar?.curveStrokeWidth || 2,
                graticuleColor: this.radar?.graticuleColor || `#DEDEDE`,
                graticuleStrokeWidth: this.radar?.graticuleStrokeWidth || 1,
                graticuleOpacity: this.radar?.graticuleOpacity || .3,
                legendBoxSize: this.radar?.legendBoxSize || 12,
                legendFontSize: this.radar?.legendFontSize || 12
            }, this.wardleyEvolutionColor = this.wardleyEvolutionColor || `#dc3545`, this.wardley = {
                backgroundColor: this.wardley?.backgroundColor || this.background,
                axisColor: this.wardley?.axisColor || this.lineColor,
                axisTextColor: this.wardley?.axisTextColor || this.primaryTextColor,
                gridColor: this.wardley?.gridColor || this.gridColor,
                componentFill: this.wardley?.componentFill || this.background,
                componentStroke: this.wardley?.componentStroke || this.lineColor,
                componentLabelColor: this.wardley?.componentLabelColor || this.primaryTextColor,
                linkStroke: this.wardley?.linkStroke || this.lineColor,
                evolutionStroke: this.wardley?.evolutionStroke || this.wardleyEvolutionColor,
                annotationStroke: this.wardley?.annotationStroke || this.lineColor,
                annotationTextColor: this.wardley?.annotationTextColor || this.primaryTextColor,
                annotationFill: this.wardley?.annotationFill || this.background
            }, this.xyChart = {
                backgroundColor: this.xyChart?.backgroundColor || this.background,
                titleColor: this.xyChart?.titleColor || this.primaryTextColor,
                dataLabelColor: this.xyChart?.dataLabelColor || this.primaryTextColor,
                legendTextColor: this.xyChart?.legendTextColor || this.primaryTextColor,
                xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
                xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
                xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
                xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
                yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
                yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
                yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
                yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
                plotColorPalette: this.xyChart?.plotColorPalette || `#CDE498,#FF6B6B,#A0D2DB,#D7BDE2,#F0F0F0,#FFC3A0,#7FD8BE,#FF9A8B,#FAF3E0,#FFF176`
            }, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || `1`, this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || this.edgeLabelBackground, this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = this.git0 || this.primaryColor, this.git1 = this.git1 || this.secondaryColor, this.git2 = this.git2 || this.tertiaryColor, this.git3 = this.git3 || I(this.primaryColor, {
                h: -30
            }), this.git4 = this.git4 || I(this.primaryColor, {
                h: -60
            }), this.git5 = this.git5 || I(this.primaryColor, {
                h: -90
            }), this.git6 = this.git6 || I(this.primaryColor, {
                h: 60
            }), this.git7 = this.git7 || I(this.primaryColor, {
                h: 120
            }), this.darkMode ? (this.git0 = P(this.git0, 25), this.git1 = P(this.git1, 25), this.git2 = P(this.git2, 25), this.git3 = P(this.git3, 25), this.git4 = P(this.git4, 25), this.git5 = P(this.git5, 25), this.git6 = P(this.git6, 25), this.git7 = P(this.git7, 25)) : (this.git0 = F(this.git0, 25), this.git1 = F(this.git1, 25), this.git2 = F(this.git2, 25), this.git3 = F(this.git3, 25), this.git4 = F(this.git4, 25), this.git5 = F(this.git5, 25), this.git6 = F(this.git6, 25), this.git7 = F(this.git7, 25)), this.gitInv0 = this.gitInv0 || R(this.git0), this.gitInv1 = this.gitInv1 || R(this.git1), this.gitInv2 = this.gitInv2 || R(this.git2), this.gitInv3 = this.gitInv3 || R(this.git3), this.gitInv4 = this.gitInv4 || R(this.git4), this.gitInv5 = this.gitInv5 || R(this.git5), this.gitInv6 = this.gitInv6 || R(this.git6), this.gitInv7 = this.gitInv7 || R(this.git7), this.gitBranchLabel0 = this.gitBranchLabel0 || R(this.labelTextColor), this.gitBranchLabel1 = this.gitBranchLabel1 || this.labelTextColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.labelTextColor, this.gitBranchLabel3 = this.gitBranchLabel3 || R(this.labelTextColor), this.gitBranchLabel4 = this.gitBranchLabel4 || this.labelTextColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.labelTextColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.labelTextColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.labelTextColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || `10px`, this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || `10px`, this.emUiFill = this.emUiFill || `white`, this.emUiStroke = this.emUiStroke || `#dbdada`, this.emProcessorFill = this.emProcessorFill || `#edb3f6`, this.emProcessorStroke = this.emProcessorStroke || `#b88cbf`, this.emReadModelFill = this.emReadModelFill || `#d3f1a2`, this.emReadModelStroke = this.emReadModelStroke || `#a3b732`, this.emCommandFill = this.emCommandFill || `#bcd6fe`, this.emCommandStroke = this.emCommandStroke || `#679ac3`, this.emEventFill = this.emEventFill || `#ffb778`, this.emEventStroke = this.emEventStroke || `#c19a0f`, this.emSwimlaneBackgroundOdd = this.emSwimlaneBackgroundOdd || `rgb(250,250,250)`, this.emSwimlaneBackgroundStroke = this.emSwimlaneBackgroundStroke || `rgb(240,240,240)`, this.emArrowhead = this.emArrowhead || this.lineColor, this.emRelationStroke = this.emRelationStroke || this.lineColor, this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || B, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || V;
        }
        calculate(e) {
            if (typeof e != `object`) {
                this.updateColors();
                return;
            }
            let t = Object.keys(e);
            t.forEach((t)=>{
                this[t] = e[t];
            }), this.updateColors(), t.forEach((t)=>{
                this[t] = e[t];
            });
        }
    };
    Dt = t((e)=>{
        let t = new Et;
        return t.calculate(e), t;
    }, `getThemeVariables`);
    Ot = class {
        static{
            t(this, `Theme`);
        }
        constructor(){
            this.primaryColor = `#eee`, this.contrast = `#707070`, this.secondaryColor = P(this.contrast, 55), this.background = `#ffffff`, this.tertiaryColor = I(this.primaryColor, {
                h: -160
            }), this.primaryBorderColor = H(this.primaryColor, this.darkMode), this.secondaryBorderColor = H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = H(this.tertiaryColor, this.darkMode), this.primaryTextColor = R(this.primaryColor), this.secondaryTextColor = R(this.secondaryColor), this.tertiaryTextColor = R(this.tertiaryColor), this.lineColor = R(this.background), this.textColor = R(this.background), this.mainBkg = `#eee`, this.secondBkg = `calculated`, this.lineColor = `#666`, this.border1 = `#999`, this.border2 = `calculated`, this.note = `#ffa`, this.text = `#333`, this.critical = `#d42`, this.done = `#bbb`, this.arrowheadColor = `#333333`, this.fontFamily = `"trebuchet ms", verdana, arial, sans-serif`, this.fontSize = `16px`, this.THEME_COLOR_LIMIT = 12, this.radius = 5, this.strokeWidth = 1, this.nodeBkg = `calculated`, this.nodeBorder = `calculated`, this.clusterBkg = `calculated`, this.clusterBorder = `calculated`, this.defaultLinkColor = `calculated`, this.titleColor = `calculated`, this.edgeLabelBackground = `white`, this.actorBorder = `calculated`, this.actorBkg = `calculated`, this.actorTextColor = `calculated`, this.actorLineColor = this.actorBorder, this.signalColor = `calculated`, this.signalTextColor = `calculated`, this.labelBoxBkgColor = `calculated`, this.labelBoxBorderColor = `calculated`, this.labelTextColor = `calculated`, this.loopTextColor = `calculated`, this.noteBorderColor = `calculated`, this.noteBkgColor = `calculated`, this.noteTextColor = `calculated`, this.activationBorderColor = `#666`, this.activationBkgColor = `#f4f4f4`, this.sequenceNumberColor = `white`, this.sectionBkgColor = `calculated`, this.altSectionBkgColor = `white`, this.sectionBkgColor2 = `calculated`, this.excludeBkgColor = `#eeeeee`, this.taskBorderColor = `calculated`, this.taskBkgColor = `calculated`, this.taskTextLightColor = `white`, this.taskTextColor = `calculated`, this.taskTextDarkColor = `calculated`, this.taskTextOutsideColor = `calculated`, this.taskTextClickableColor = `#003163`, this.activeTaskBorderColor = `calculated`, this.activeTaskBkgColor = `calculated`, this.gridColor = `calculated`, this.doneTaskBkgColor = `calculated`, this.doneTaskBorderColor = `calculated`, this.critBkgColor = `calculated`, this.critBorderColor = `calculated`, this.todayLineColor = `calculated`, this.vertLineColor = `calculated`, this.personBorder = this.primaryBorderColor, this.personBkg = this.mainBkg, this.archEdgeColor = `calculated`, this.archEdgeArrowColor = `calculated`, this.archEdgeWidth = `3`, this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = `2px`, this.noteFontWeight = `normal`, this.fontWeight = `normal`, this.rowOdd = this.rowOdd || P(this.mainBkg, 75) || `#ffffff`, this.rowEven = this.rowEven || `#f4f4f4`, this.labelColor = `black`, this.errorBkgColor = `#552222`, this.errorTextColor = `#552222`, this.useGradient = !0, this.gradientStart = this.primaryBorderColor, this.gradientStop = this.secondaryBorderColor, this.dropShadow = `drop-shadow( 1px 2px 2px rgba(185,185,185,1))`;
        }
        updateColors() {
            this.secondBkg = P(this.contrast, 55), this.border2 = this.contrast, this.actorBorder = P(this.border1, 23), this.actorBkg = this.mainBkg, this.actorTextColor = this.text, this.actorLineColor = this.actorBorder, this.rectBkgColor = this.rectBkgColor || this.tertiaryColor, this.signalColor = this.text, this.signalTextColor = this.text, this.labelBoxBkgColor = this.actorBkg, this.labelBoxBorderColor = this.actorBorder, this.labelTextColor = this.text, this.loopTextColor = this.text, this.noteBorderColor = `#999`, this.noteBkgColor = `#666`, this.noteTextColor = `#fff`, this.cScale0 = this.cScale0 || `#555`, this.cScale1 = this.cScale1 || `#F4F4F4`, this.cScale2 = this.cScale2 || `#555`, this.cScale3 = this.cScale3 || `#BBB`, this.cScale4 = this.cScale4 || `#777`, this.cScale5 = this.cScale5 || `#999`, this.cScale6 = this.cScale6 || `#DDD`, this.cScale7 = this.cScale7 || `#FFF`, this.cScale8 = this.cScale8 || `#DDD`, this.cScale9 = this.cScale9 || `#BBB`, this.cScale10 = this.cScale10 || `#999`, this.cScale11 = this.cScale11 || `#777`;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleInv` + e] = this[`cScaleInv` + e] || R(this[`cScale` + e]);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this.darkMode ? this[`cScalePeer` + e] = this[`cScalePeer` + e] || P(this[`cScale` + e], 10) : this[`cScalePeer` + e] = this[`cScalePeer` + e] || F(this[`cScale` + e], 10);
            this.scaleLabelColor = this.scaleLabelColor || (this.darkMode ? `black` : this.labelTextColor), this.cScaleLabel0 = this.cScaleLabel0 || this.cScale1, this.cScaleLabel2 = this.cScaleLabel2 || this.cScale1;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleLabel` + e] = this[`cScaleLabel` + e] || this.scaleLabelColor;
            for(let e = 0; e < 5; e++)this[`surface` + e] = this[`surface` + e] || I(this.mainBkg, {
                l: -(5 + e * 5)
            }), this[`surfacePeer` + e] = this[`surfacePeer` + e] || I(this.mainBkg, {
                l: -(8 + e * 5)
            });
            this.nodeBkg = this.mainBkg, this.nodeBorder = this.border1, this.clusterBkg = this.secondBkg, this.clusterBorder = this.border2, this.defaultLinkColor = this.lineColor, this.titleColor = this.text, this.sectionBkgColor = P(this.contrast, 30), this.sectionBkgColor2 = P(this.contrast, 30), this.taskBorderColor = F(this.contrast, 10), this.taskBkgColor = this.contrast, this.taskTextColor = this.taskTextLightColor, this.taskTextDarkColor = this.text, this.taskTextOutsideColor = this.taskTextDarkColor, this.activeTaskBorderColor = this.taskBorderColor, this.activeTaskBkgColor = this.mainBkg, this.gridColor = P(this.border1, 30), this.doneTaskBkgColor = this.done, this.doneTaskBorderColor = this.lineColor, this.critBkgColor = this.critical, this.critBorderColor = F(this.critBkgColor, 10), this.todayLineColor = this.critBkgColor, this.vertLineColor = this.critBkgColor, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.transitionColor = this.transitionColor || `#000`, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || `#f4f4f4`, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.stateBorder = this.stateBorder || `#000`, this.innerEndBackground = this.primaryBorderColor, this.specialStateColor = `#222`, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.classText = this.primaryTextColor, this.fillType0 = this.primaryColor, this.fillType1 = this.secondaryColor, this.fillType2 = I(this.primaryColor, {
                h: 64
            }), this.fillType3 = I(this.secondaryColor, {
                h: 64
            }), this.fillType4 = I(this.primaryColor, {
                h: -64
            }), this.fillType5 = I(this.secondaryColor, {
                h: -64
            }), this.fillType6 = I(this.primaryColor, {
                h: 128
            }), this.fillType7 = I(this.secondaryColor, {
                h: 128
            });
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`pie` + e] = this[`cScale` + e];
            this.pie12 = this.pie0, this.pieTitleTextSize = this.pieTitleTextSize || `25px`, this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || `17px`, this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || `17px`, this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || `black`, this.pieStrokeWidth = this.pieStrokeWidth || `2px`, this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || `2px`, this.pieOuterStrokeColor = this.pieOuterStrokeColor || `black`, this.pieOpacity = this.pieOpacity || `0.7`;
            for(let e = 0; e < 8; e++)this[`venn` + (e + 1)] = this[`venn` + (e + 1)] ?? this[`cScale` + e];
            this.vennTitleTextColor = this.vennTitleTextColor ?? this.titleColor, this.vennSetTextColor = this.vennSetTextColor ?? this.textColor, this.cynefin = {
                domainFontSize: this.cynefin?.domainFontSize || 16,
                itemFontSize: this.cynefin?.itemFontSize || 12,
                boundaryColor: this.cynefin?.boundaryColor || this.lineColor,
                boundaryWidth: this.cynefin?.boundaryWidth || 2,
                cliffColor: this.cynefin?.cliffColor || `#8B0000`,
                cliffWidth: this.cynefin?.cliffWidth || 4,
                arrowColor: this.cynefin?.arrowColor || this.lineColor,
                arrowWidth: this.cynefin?.arrowWidth || 2,
                complexBg: this.cynefin?.complexBg || `#E8F5E9`,
                complicatedBg: this.cynefin?.complicatedBg || `#E3F2FD`,
                chaoticBg: this.cynefin?.chaoticBg || `#FBE9E7`,
                clearBg: this.cynefin?.clearBg || `#FFF8E1`,
                confusionBg: this.cynefin?.confusionBg || `#F3E5F5`,
                textColor: this.cynefin?.textColor || this.textColor,
                labelColor: this.cynefin?.labelColor || this.primaryTextColor
            }, this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || I(this.primaryColor, {
                r: 5,
                g: 5,
                b: 5
            }), this.quadrant3Fill = this.quadrant3Fill || I(this.primaryColor, {
                r: 10,
                g: 10,
                b: 10
            }), this.quadrant4Fill = this.quadrant4Fill || I(this.primaryColor, {
                r: 15,
                g: 15,
                b: 15
            }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || I(this.primaryTextColor, {
                r: -5,
                g: -5,
                b: -5
            }), this.quadrant3TextFill = this.quadrant3TextFill || I(this.primaryTextColor, {
                r: -10,
                g: -10,
                b: -10
            }), this.quadrant4TextFill = this.quadrant4TextFill || I(this.primaryTextColor, {
                r: -15,
                g: -15,
                b: -15
            }), this.quadrantPointFill = this.quadrantPointFill || M(this.quadrant1Fill) ? P(this.quadrant1Fill) : F(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
                backgroundColor: this.xyChart?.backgroundColor || this.background,
                titleColor: this.xyChart?.titleColor || this.primaryTextColor,
                dataLabelColor: this.xyChart?.dataLabelColor || this.primaryTextColor,
                legendTextColor: this.xyChart?.legendTextColor || this.primaryTextColor,
                xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
                xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
                xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
                xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
                yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
                yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
                yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
                yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
                plotColorPalette: this.xyChart?.plotColorPalette || `#EEE,#6BB8E4,#8ACB88,#C7ACD6,#E8DCC2,#FFB2A8,#FFF380,#7E8D91,#FFD8B1,#FAF3E0`
            }, this.radar = {
                axisColor: this.radar?.axisColor || this.lineColor,
                axisStrokeWidth: this.radar?.axisStrokeWidth || 2,
                axisLabelFontSize: this.radar?.axisLabelFontSize || 12,
                curveOpacity: this.radar?.curveOpacity || .5,
                curveStrokeWidth: this.radar?.curveStrokeWidth || 2,
                graticuleColor: this.radar?.graticuleColor || `#DEDEDE`,
                graticuleStrokeWidth: this.radar?.graticuleStrokeWidth || 1,
                graticuleOpacity: this.radar?.graticuleOpacity || .3,
                legendBoxSize: this.radar?.legendBoxSize || 12,
                legendFontSize: this.radar?.legendFontSize || 12
            }, this.wardleyEvolutionColor = this.wardleyEvolutionColor || `#dc3545`, this.wardley = {
                backgroundColor: this.wardley?.backgroundColor || this.background,
                axisColor: this.wardley?.axisColor || this.lineColor,
                axisTextColor: this.wardley?.axisTextColor || this.primaryTextColor,
                gridColor: this.wardley?.gridColor || this.gridColor,
                componentFill: this.wardley?.componentFill || this.background,
                componentStroke: this.wardley?.componentStroke || this.lineColor,
                componentLabelColor: this.wardley?.componentLabelColor || this.primaryTextColor,
                linkStroke: this.wardley?.linkStroke || this.lineColor,
                evolutionStroke: this.wardley?.evolutionStroke || this.wardleyEvolutionColor,
                annotationStroke: this.wardley?.annotationStroke || this.lineColor,
                annotationTextColor: this.wardley?.annotationTextColor || this.primaryTextColor,
                annotationFill: this.wardley?.annotationFill || this.background
            }, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || `1`, this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || this.edgeLabelBackground, this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = F(this.pie1, 25) || this.primaryColor, this.git1 = this.pie2 || this.secondaryColor, this.git2 = this.pie3 || this.tertiaryColor, this.git3 = this.pie4 || I(this.primaryColor, {
                h: -30
            }), this.git4 = this.pie5 || I(this.primaryColor, {
                h: -60
            }), this.git5 = this.pie6 || I(this.primaryColor, {
                h: -90
            }), this.git6 = this.pie7 || I(this.primaryColor, {
                h: 60
            }), this.git7 = this.pie8 || I(this.primaryColor, {
                h: 120
            }), this.gitInv0 = this.gitInv0 || R(this.git0), this.gitInv1 = this.gitInv1 || R(this.git1), this.gitInv2 = this.gitInv2 || R(this.git2), this.gitInv3 = this.gitInv3 || R(this.git3), this.gitInv4 = this.gitInv4 || R(this.git4), this.gitInv5 = this.gitInv5 || R(this.git5), this.gitInv6 = this.gitInv6 || R(this.git6), this.gitInv7 = this.gitInv7 || R(this.git7), this.branchLabelColor = this.branchLabelColor || this.labelTextColor, this.gitBranchLabel0 = this.branchLabelColor, this.gitBranchLabel1 = `white`, this.gitBranchLabel2 = this.branchLabelColor, this.gitBranchLabel3 = `white`, this.gitBranchLabel4 = this.branchLabelColor, this.gitBranchLabel5 = this.branchLabelColor, this.gitBranchLabel6 = this.branchLabelColor, this.gitBranchLabel7 = this.branchLabelColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || `10px`, this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || `10px`, this.emUiFill = this.emUiFill || `white`, this.emUiStroke = this.emUiStroke || `#dbdada`, this.emProcessorFill = this.emProcessorFill || `#edb3f6`, this.emProcessorStroke = this.emProcessorStroke || `#b88cbf`, this.emReadModelFill = this.emReadModelFill || `#d3f1a2`, this.emReadModelStroke = this.emReadModelStroke || `#a3b732`, this.emCommandFill = this.emCommandFill || `#bcd6fe`, this.emCommandStroke = this.emCommandStroke || `#679ac3`, this.emEventFill = this.emEventFill || `#ffb778`, this.emEventStroke = this.emEventStroke || `#c19a0f`, this.emSwimlaneBackgroundOdd = this.emSwimlaneBackgroundOdd || `rgb(250,250,250)`, this.emSwimlaneBackgroundStroke = this.emSwimlaneBackgroundStroke || `rgb(240,240,240)`, this.emArrowhead = this.emArrowhead || this.lineColor, this.emRelationStroke = this.emRelationStroke || this.lineColor, this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || B, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || V;
        }
        calculate(e) {
            if (typeof e != `object`) {
                this.updateColors();
                return;
            }
            let t = Object.keys(e);
            t.forEach((t)=>{
                this[t] = e[t];
            }), this.updateColors(), t.forEach((t)=>{
                this[t] = e[t];
            });
        }
    };
    kt = t((e)=>{
        let t = new Ot;
        return t.calculate(e), t;
    }, `getThemeVariables`);
    At = class {
        static{
            t(this, `Theme`);
        }
        constructor(){
            this.background = `#ffffff`, this.primaryColor = `#cccccc`, this.mainBkg = `#ffffff`, this.noteBkgColor = `#fff5ad`, this.noteTextColor = `#333`, this.THEME_COLOR_LIMIT = 12, this.radius = 3, this.strokeWidth = 2, this.primaryBorderColor = H(this.primaryColor, this.darkMode), this.fontFamily = `arial, sans-serif`, this.fontSize = `14px`, this.nodeBorder = `#000000`, this.stateBorder = `#000000`, this.useGradient = !0, this.gradientStart = `#0042eb`, this.gradientStop = `#eb0042`, this.dropShadow = `drop-shadow( 0px 1px 2px rgba(0, 0, 0, 0.25));`, this.tertiaryColor = `#ffffff`, this.archEdgeColor = `calculated`, this.archEdgeArrowColor = `calculated`, this.archEdgeWidth = `3`, this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = `2px`, this.noteFontWeight = `normal`, this.fontWeight = `normal`;
        }
        updateColors() {
            this.primaryTextColor = this.primaryTextColor || (this.darkMode ? `#eee` : `#333`), this.secondaryColor = this.secondaryColor || I(this.primaryColor, {
                h: -120
            }), this.tertiaryColor = this.tertiaryColor || I(this.primaryColor, {
                h: 180,
                l: 5
            }), this.primaryBorderColor = this.primaryBorderColor || H(this.primaryColor, this.darkMode), this.secondaryBorderColor = this.secondaryBorderColor || H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = this.tertiaryBorderColor || H(this.tertiaryColor, this.darkMode), this.noteBorderColor = this.noteBorderColor || H(this.noteBkgColor, this.darkMode), this.noteBkgColor = this.noteBkgColor || `#fff5ad`, this.noteTextColor = this.noteTextColor || `#333`, this.secondaryTextColor = this.secondaryTextColor || R(this.secondaryColor), this.tertiaryTextColor = this.tertiaryTextColor || R(this.tertiaryColor), this.lineColor = this.lineColor || R(this.background), this.arrowheadColor = this.arrowheadColor || R(this.background), this.textColor = this.textColor || this.primaryTextColor, this.border2 = this.border2 || this.tertiaryBorderColor, this.nodeBkg = this.nodeBkg || this.primaryColor, this.mainBkg = this.mainBkg || this.primaryColor, this.nodeBorder = this.nodeBorder || this.primaryBorderColor, this.clusterBkg = this.clusterBkg || this.tertiaryColor, this.clusterBorder = this.clusterBorder || this.tertiaryBorderColor, this.defaultLinkColor = this.defaultLinkColor || this.lineColor, this.titleColor = this.titleColor || this.tertiaryTextColor, this.edgeLabelBackground = this.edgeLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.nodeTextColor = this.nodeTextColor || this.primaryTextColor, this.actorBorder = this.actorBorder || this.primaryBorderColor, this.actorBkg = this.actorBkg || this.mainBkg, this.actorTextColor = this.actorTextColor || this.primaryTextColor, this.actorLineColor = this.actorLineColor || this.actorBorder, this.labelBoxBkgColor = this.labelBoxBkgColor || this.actorBkg, this.signalColor = this.signalColor || this.textColor, this.signalTextColor = this.signalTextColor || this.textColor, this.labelBoxBorderColor = this.labelBoxBorderColor || this.actorBorder, this.labelTextColor = this.labelTextColor || this.actorTextColor, this.loopTextColor = this.loopTextColor || this.actorTextColor, this.activationBorderColor = this.activationBorderColor || F(this.secondaryColor, 10), this.activationBkgColor = this.activationBkgColor || this.secondaryColor, this.sequenceNumberColor = this.sequenceNumberColor || R(this.lineColor), this.rectBkgColor = this.rectBkgColor || this.tertiaryColor;
            let e = `#ECECFE`, t = `#E9E9F1`, n = I(e, {
                h: 180,
                l: 5
            });
            if (this.sectionBkgColor = this.sectionBkgColor || n, this.altSectionBkgColor = this.altSectionBkgColor || `white`, this.sectionBkgColor = this.sectionBkgColor || t, this.sectionBkgColor2 = this.sectionBkgColor2 || e, this.excludeBkgColor = this.excludeBkgColor || `#eeeeee`, this.taskBorderColor = this.taskBorderColor || this.primaryBorderColor, this.taskBkgColor = this.taskBkgColor || e, this.activeTaskBorderColor = this.activeTaskBorderColor || e, this.activeTaskBkgColor = this.activeTaskBkgColor || P(e, 23), this.gridColor = this.gridColor || `lightgrey`, this.doneTaskBkgColor = this.doneTaskBkgColor || `lightgrey`, this.doneTaskBorderColor = this.doneTaskBorderColor || `grey`, this.critBorderColor = this.critBorderColor || `#ff8888`, this.critBkgColor = this.critBkgColor || `red`, this.todayLineColor = this.todayLineColor || `red`, this.taskTextColor = this.taskTextColor || this.textColor, this.taskTextOutsideColor = this.taskTextOutsideColor || this.textColor, this.vertLineColor = this.vertLineColor || this.primaryBorderColor, this.taskTextLightColor = this.taskTextLightColor || this.textColor, this.taskTextColor = this.taskTextColor || this.primaryTextColor, this.taskTextDarkColor = this.taskTextDarkColor || this.textColor, this.taskTextClickableColor = this.taskTextClickableColor || `#003163`, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.personBorder = this.personBorder || this.primaryBorderColor, this.personBkg = this.personBkg || this.mainBkg, this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || `#f0f0f0`, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.nodeBorder, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.specialStateColor = this.lineColor, this.cScale0 = this.cScale0 || e, this.cScale1 = this.cScale1 || t, this.cScale2 = this.cScale2 || n, this.cScale3 = this.cScale3 || I(e, {
                h: 30
            }), this.cScale4 = this.cScale4 || I(e, {
                h: 60
            }), this.cScale5 = this.cScale5 || I(e, {
                h: 90
            }), this.cScale6 = this.cScale6 || I(e, {
                h: 120
            }), this.cScale7 = this.cScale7 || I(e, {
                h: 150
            }), this.cScale8 = this.cScale8 || I(e, {
                h: 210,
                l: 150
            }), this.cScale9 = this.cScale9 || I(e, {
                h: 270
            }), this.cScale10 = this.cScale10 || I(e, {
                h: 300
            }), this.cScale11 = this.cScale11 || I(e, {
                h: 330
            }), this.darkMode) for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 75);
            else for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 25);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleInv` + e] = this[`cScaleInv` + e] || R(this[`cScale` + e]);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this.darkMode ? this[`cScalePeer` + e] = this[`cScalePeer` + e] || P(this[`cScale` + e], 10) : this[`cScalePeer` + e] = this[`cScalePeer` + e] || F(this[`cScale` + e], 10);
            this.scaleLabelColor = this.scaleLabelColor || this.labelTextColor;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleLabel` + e] = this[`cScaleLabel` + e] || this.scaleLabelColor;
            let r = this.darkMode ? -4 : -1;
            for(let e = 0; e < 5; e++)this[`surface` + e] = this[`surface` + e] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: r * (5 + e * 3)
            }), this[`surfacePeer` + e] = this[`surfacePeer` + e] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: r * (8 + e * 3)
            });
            this.classText = this.classText || this.textColor, this.fillType0 = this.fillType0 || e, this.fillType1 = this.fillType1 || t, this.fillType2 = this.fillType2 || I(e, {
                h: 64
            }), this.fillType3 = this.fillType3 || I(t, {
                h: 64
            }), this.fillType4 = this.fillType4 || I(e, {
                h: -64
            }), this.fillType5 = this.fillType5 || I(t, {
                h: -64
            }), this.fillType6 = this.fillType6 || I(e, {
                h: 128
            }), this.fillType7 = this.fillType7 || I(t, {
                h: 128
            }), this.pie1 = this.pie1 || e, this.pie2 = this.pie2 || t, this.pie3 = this.pie3 || n, this.pie4 = this.pie4 || I(e, {
                l: -10
            }), this.pie5 = this.pie5 || I(t, {
                l: -10
            }), this.pie6 = this.pie6 || I(n, {
                l: -10
            }), this.pie7 = this.pie7 || I(e, {
                h: 60,
                l: -10
            }), this.pie8 = this.pie8 || I(e, {
                h: -60,
                l: -10
            }), this.pie9 = this.pie9 || I(e, {
                h: 120,
                l: 0
            }), this.pie10 = this.pie10 || I(e, {
                h: 60,
                l: -20
            }), this.pie11 = this.pie11 || I(e, {
                h: -60,
                l: -20
            }), this.pie12 = this.pie12 || I(e, {
                h: 120,
                l: -10
            }), this.pieTitleTextSize = this.pieTitleTextSize || `25px`, this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || `17px`, this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || `17px`, this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || `black`, this.pieStrokeWidth = this.pieStrokeWidth || `2px`, this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || `2px`, this.pieOuterStrokeColor = this.pieOuterStrokeColor || `black`, this.pieOpacity = this.pieOpacity || `0.7`, this.vennTitleTextColor = this.vennTitleTextColor ?? this.titleColor, this.vennSetTextColor = this.vennSetTextColor ?? this.textColor, this.quadrant1Fill = this.quadrant1Fill || e, this.quadrant2Fill = this.quadrant2Fill || I(e, {
                r: 5,
                g: 5,
                b: 5
            }), this.quadrant3Fill = this.quadrant3Fill || I(e, {
                r: 10,
                g: 10,
                b: 10
            }), this.quadrant4Fill = this.quadrant4Fill || I(e, {
                r: 15,
                g: 15,
                b: 15
            }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || I(this.primaryTextColor, {
                r: -5,
                g: -5,
                b: -5
            }), this.quadrant3TextFill = this.quadrant3TextFill || I(this.primaryTextColor, {
                r: -10,
                g: -10,
                b: -10
            }), this.quadrant4TextFill = this.quadrant4TextFill || I(this.primaryTextColor, {
                r: -15,
                g: -15,
                b: -15
            }), this.quadrantPointFill = this.quadrantPointFill || M(this.quadrant1Fill) ? P(this.quadrant1Fill) : F(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
                backgroundColor: this.xyChart?.backgroundColor || this.background,
                titleColor: this.xyChart?.titleColor || this.primaryTextColor,
                legendTextColor: this.xyChart?.legendTextColor || this.primaryTextColor,
                xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
                xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
                xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
                xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
                yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
                yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
                yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
                yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
                plotColorPalette: this.xyChart?.plotColorPalette || `#FFF4DD,#FFD8B1,#FFA07A,#ECEFF1,#D6DBDF,#C3E0A8,#FFB6A4,#FFD74D,#738FA7,#FFFFF0`
            }, this.requirementBackground = this.requirementBackground || e, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || `1`, this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = this.git0 || e, this.git1 = this.git1 || t, this.git2 = this.git2 || n, this.git3 = this.git3 || I(e, {
                h: -30
            }), this.git4 = this.git4 || I(e, {
                h: -60
            }), this.git5 = this.git5 || I(e, {
                h: -90
            }), this.git6 = this.git6 || I(e, {
                h: 60
            }), this.git7 = this.git7 || I(e, {
                h: 120
            }), this.darkMode ? (this.git0 = P(this.git0, 25), this.git1 = P(this.git1, 25), this.git2 = P(this.git2, 25), this.git3 = P(this.git3, 25), this.git4 = P(this.git4, 25), this.git5 = P(this.git5, 25), this.git6 = P(this.git6, 25), this.git7 = P(this.git7, 25)) : (this.git0 = F(this.git0, 25), this.git1 = F(this.git1, 25), this.git2 = F(this.git2, 25), this.git3 = F(this.git3, 25), this.git4 = F(this.git4, 25), this.git5 = F(this.git5, 25), this.git6 = F(this.git6, 25), this.git7 = F(this.git7, 25)), this.gitInv0 = this.gitInv0 || R(this.git0), this.gitInv1 = this.gitInv1 || R(this.git1), this.gitInv2 = this.gitInv2 || R(this.git2), this.gitInv3 = this.gitInv3 || R(this.git3), this.gitInv4 = this.gitInv4 || R(this.git4), this.gitInv5 = this.gitInv5 || R(this.git5), this.gitInv6 = this.gitInv6 || R(this.git6), this.gitInv7 = this.gitInv7 || R(this.git7), this.branchLabelColor = this.branchLabelColor || (this.darkMode ? `black` : this.labelTextColor), this.gitBranchLabel0 = this.gitBranchLabel0 || this.branchLabelColor, this.gitBranchLabel1 = this.gitBranchLabel1 || this.branchLabelColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.branchLabelColor, this.gitBranchLabel3 = this.gitBranchLabel3 || this.branchLabelColor, this.gitBranchLabel4 = this.gitBranchLabel4 || this.branchLabelColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.branchLabelColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.branchLabelColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.branchLabelColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || `10px`, this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || `10px`, this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || B, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || V;
        }
        calculate(e) {
            if (typeof e != `object`) {
                this.updateColors();
                return;
            }
            let t = Object.keys(e);
            t.forEach((t)=>{
                this[t] = e[t];
            }), this.updateColors(), t.forEach((t)=>{
                this[t] = e[t];
            });
        }
    };
    jt = t((e)=>{
        let t = new At;
        return t.calculate(e), t;
    }, `getThemeVariables`);
    Mt = class {
        static{
            t(this, `Theme`);
        }
        constructor(){
            this.background = `#333`, this.primaryColor = `#1f2020`, this.secondaryColor = P(this.primaryColor, 16), this.tertiaryColor = I(this.primaryColor, {
                h: -160
            }), this.primaryBorderColor = R(this.background), this.secondaryBorderColor = H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = H(this.tertiaryColor, this.darkMode), this.primaryTextColor = R(this.primaryColor), this.secondaryTextColor = R(this.secondaryColor), this.tertiaryTextColor = R(this.tertiaryColor), this.mainBkg = `#2a2020`, this.secondBkg = `calculated`, this.mainContrastColor = `lightgrey`, this.darkTextColor = P(R(`#323D47`), 10), this.border1 = `#ccc`, this.border2 = j(255, 255, 255, .25), this.arrowheadColor = R(this.background), this.fontFamily = `arial, sans-serif`, this.fontSize = `14px`, this.labelBackground = `#181818`, this.textColor = `#ccc`, this.THEME_COLOR_LIMIT = 12, this.radius = 3, this.strokeWidth = 1, this.noteBkgColor = `#fff5ad`, this.noteTextColor = `#333`, this.THEME_COLOR_LIMIT = 12, this.fontFamily = `arial, sans-serif`, this.fontSize = `14px`, this.useGradient = !0, this.gradientStart = `#0042eb`, this.gradientStop = `#eb0042`, this.dropShadow = `drop-shadow( 1px 2px 2px rgba(185,185,185,0.2))`, this.archEdgeColor = `calculated`, this.archEdgeArrowColor = `calculated`, this.archEdgeWidth = `3`, this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = `2px`, this.noteFontWeight = `normal`, this.fontWeight = `normal`;
        }
        updateColors() {
            if (this.primaryTextColor = this.primaryTextColor || (this.darkMode ? `#eee` : `#333`), this.secondaryColor = this.secondaryColor || I(this.primaryColor, {
                h: -120
            }), this.tertiaryColor = this.tertiaryColor || I(this.primaryColor, {
                h: 180,
                l: 5
            }), this.primaryBorderColor = this.primaryBorderColor || H(this.primaryColor, this.darkMode), this.secondaryBorderColor = this.secondaryBorderColor || H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = this.tertiaryBorderColor || H(this.tertiaryColor, this.darkMode), this.noteBorderColor = this.noteBorderColor || H(this.noteBkgColor, this.darkMode), this.noteBkgColor = this.noteBkgColor || `#fff5ad`, this.noteTextColor = this.noteTextColor || `#333`, this.secondaryTextColor = this.secondaryTextColor || R(this.secondaryColor), this.tertiaryTextColor = this.tertiaryTextColor || R(this.tertiaryColor), this.lineColor = this.lineColor || R(this.background), this.arrowheadColor = this.arrowheadColor || R(this.background), this.textColor = this.textColor || this.primaryTextColor, this.border2 = this.border2 || this.tertiaryBorderColor, this.nodeBkg = this.nodeBkg || this.primaryColor, this.mainBkg = this.mainBkg || this.primaryColor, this.nodeBorder = this.nodeBorder || this.border1, this.clusterBkg = this.clusterBkg || this.tertiaryColor, this.clusterBorder = this.clusterBorder || this.tertiaryBorderColor, this.defaultLinkColor = this.defaultLinkColor || this.lineColor, this.titleColor = this.titleColor || this.tertiaryTextColor, this.edgeLabelBackground = this.edgeLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.nodeTextColor = this.nodeTextColor || this.primaryTextColor, this.actorBorder = this.actorBorder || this.primaryBorderColor, this.actorBkg = this.actorBkg || this.mainBkg, this.actorTextColor = this.actorTextColor || this.primaryTextColor, this.actorLineColor = this.actorLineColor || this.actorBorder, this.labelBoxBkgColor = this.labelBoxBkgColor || this.actorBkg, this.signalColor = this.signalColor || this.textColor, this.signalTextColor = this.signalTextColor || this.textColor, this.labelBoxBorderColor = this.labelBoxBorderColor || this.actorBorder, this.labelTextColor = this.labelTextColor || this.actorTextColor, this.loopTextColor = this.loopTextColor || this.actorTextColor, this.activationBorderColor = this.activationBorderColor || F(this.secondaryColor, 10), this.activationBkgColor = this.activationBkgColor || this.secondaryColor, this.sequenceNumberColor = this.sequenceNumberColor || R(this.lineColor), this.rectBkgColor = this.rectBkgColor || this.tertiaryColor, this.sectionBkgColor = this.sectionBkgColor || this.tertiaryColor, this.altSectionBkgColor = this.altSectionBkgColor || `white`, this.sectionBkgColor = this.sectionBkgColor || this.secondaryColor, this.sectionBkgColor2 = this.sectionBkgColor2 || this.primaryColor, this.excludeBkgColor = this.excludeBkgColor || `#eeeeee`, this.taskBorderColor = this.taskBorderColor || this.primaryBorderColor, this.taskBkgColor = this.taskBkgColor || this.primaryColor, this.activeTaskBorderColor = this.activeTaskBorderColor || this.primaryColor, this.activeTaskBkgColor = this.activeTaskBkgColor || P(this.primaryColor, 23), this.gridColor = this.gridColor || `lightgrey`, this.doneTaskBkgColor = this.doneTaskBkgColor || `lightgrey`, this.doneTaskBorderColor = this.doneTaskBorderColor || `grey`, this.critBorderColor = this.critBorderColor || `#ff8888`, this.critBkgColor = this.critBkgColor || `red`, this.todayLineColor = this.todayLineColor || `red`, this.vertLineColor = this.vertLineColor || this.primaryBorderColor, this.taskTextColor = this.taskTextColor || this.textColor, this.taskTextOutsideColor = this.taskTextOutsideColor || this.textColor, this.taskTextLightColor = this.taskTextLightColor || this.textColor, this.taskTextColor = this.taskTextColor || this.primaryTextColor, this.taskTextDarkColor = this.taskTextDarkColor || this.textColor, this.taskTextClickableColor = this.taskTextClickableColor || `#003163`, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.personBorder = this.personBorder || this.primaryBorderColor, this.personBkg = this.personBkg || this.mainBkg, this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || `#f0f0f0`, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.nodeBorder, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.specialStateColor = this.lineColor, this.cScale0 = this.cScale0 || this.primaryColor, this.cScale1 = this.cScale1 || this.secondaryColor, this.cScale2 = this.cScale2 || this.tertiaryColor, this.cScale3 = this.cScale3 || I(this.primaryColor, {
                h: 30
            }), this.cScale4 = this.cScale4 || I(this.primaryColor, {
                h: 60
            }), this.cScale5 = this.cScale5 || I(this.primaryColor, {
                h: 90
            }), this.cScale6 = this.cScale6 || I(this.primaryColor, {
                h: 120
            }), this.cScale7 = this.cScale7 || I(this.primaryColor, {
                h: 150
            }), this.cScale8 = this.cScale8 || I(this.primaryColor, {
                h: 210,
                l: 150
            }), this.cScale9 = this.cScale9 || I(this.primaryColor, {
                h: 270
            }), this.cScale10 = this.cScale10 || I(this.primaryColor, {
                h: 300
            }), this.cScale11 = this.cScale11 || I(this.primaryColor, {
                h: 330
            }), this.darkMode) for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 75);
            else for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 25);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleInv` + e] = this[`cScaleInv` + e] || R(this[`cScale` + e]);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this.darkMode ? this[`cScalePeer` + e] = this[`cScalePeer` + e] || P(this[`cScale` + e], 10) : this[`cScalePeer` + e] = this[`cScalePeer` + e] || F(this[`cScale` + e], 10);
            this.scaleLabelColor = this.scaleLabelColor || this.labelTextColor;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleLabel` + e] = this[`cScaleLabel` + e] || this.scaleLabelColor;
            let e = this.darkMode ? -4 : -1;
            for(let t = 0; t < 5; t++)this[`surface` + t] = this[`surface` + t] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: e * (5 + t * 3)
            }), this[`surfacePeer` + t] = this[`surfacePeer` + t] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: e * (8 + t * 3)
            });
            this.classText = this.classText || this.textColor, this.fillType0 = this.fillType0 || this.primaryColor, this.fillType1 = this.fillType1 || this.secondaryColor, this.fillType2 = this.fillType2 || I(this.primaryColor, {
                h: 64
            }), this.fillType3 = this.fillType3 || I(this.secondaryColor, {
                h: 64
            }), this.fillType4 = this.fillType4 || I(this.primaryColor, {
                h: -64
            }), this.fillType5 = this.fillType5 || I(this.secondaryColor, {
                h: -64
            }), this.fillType6 = this.fillType6 || I(this.primaryColor, {
                h: 128
            }), this.fillType7 = this.fillType7 || I(this.secondaryColor, {
                h: 128
            }), this.pie1 = this.pie1 || this.primaryColor, this.pie2 = this.pie2 || this.secondaryColor, this.pie3 = this.pie3 || this.tertiaryColor, this.pie4 = this.pie4 || I(this.primaryColor, {
                l: -10
            }), this.pie5 = this.pie5 || I(this.secondaryColor, {
                l: -10
            }), this.pie6 = this.pie6 || I(this.tertiaryColor, {
                l: -10
            }), this.pie7 = this.pie7 || I(this.primaryColor, {
                h: 60,
                l: -10
            }), this.pie8 = this.pie8 || I(this.primaryColor, {
                h: -60,
                l: -10
            }), this.pie9 = this.pie9 || I(this.primaryColor, {
                h: 120,
                l: 0
            }), this.pie10 = this.pie10 || I(this.primaryColor, {
                h: 60,
                l: -20
            }), this.pie11 = this.pie11 || I(this.primaryColor, {
                h: -60,
                l: -20
            }), this.pie12 = this.pie12 || I(this.primaryColor, {
                h: 120,
                l: -10
            }), this.pieTitleTextSize = this.pieTitleTextSize || `25px`, this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || `17px`, this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || `17px`, this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || `black`, this.pieStrokeWidth = this.pieStrokeWidth || `2px`, this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || `2px`, this.pieOuterStrokeColor = this.pieOuterStrokeColor || `black`, this.pieOpacity = this.pieOpacity || `0.7`, this.vennTitleTextColor = this.vennTitleTextColor ?? this.titleColor, this.vennSetTextColor = this.vennSetTextColor ?? this.textColor, this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || I(this.primaryColor, {
                r: 5,
                g: 5,
                b: 5
            }), this.quadrant3Fill = this.quadrant3Fill || I(this.primaryColor, {
                r: 10,
                g: 10,
                b: 10
            }), this.quadrant4Fill = this.quadrant4Fill || I(this.primaryColor, {
                r: 15,
                g: 15,
                b: 15
            }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || I(this.primaryTextColor, {
                r: -5,
                g: -5,
                b: -5
            }), this.quadrant3TextFill = this.quadrant3TextFill || I(this.primaryTextColor, {
                r: -10,
                g: -10,
                b: -10
            }), this.quadrant4TextFill = this.quadrant4TextFill || I(this.primaryTextColor, {
                r: -15,
                g: -15,
                b: -15
            }), this.quadrantPointFill = this.quadrantPointFill || M(this.quadrant1Fill) ? P(this.quadrant1Fill) : F(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
                backgroundColor: this.xyChart?.backgroundColor || this.background,
                titleColor: this.xyChart?.titleColor || this.primaryTextColor,
                legendTextColor: this.xyChart?.legendTextColor || this.primaryTextColor,
                xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
                xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
                xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
                xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
                yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
                yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
                yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
                yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
                plotColorPalette: this.xyChart?.plotColorPalette || `#FFF4DD,#FFD8B1,#FFA07A,#ECEFF1,#D6DBDF,#C3E0A8,#FFB6A4,#FFD74D,#738FA7,#FFFFF0`
            }, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || `1`, this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = this.git0 || `#0b0000`, this.git1 = this.git1 || `#4d1037`, this.git2 = this.git2 || `#3f5258`, this.git3 = this.git3 || `#4f2f1b`, this.git4 = this.git4 || `#6e0a0a`, this.git5 = this.git5 || `#3b0048`, this.git6 = this.git6 || `#995a01`, this.git7 = this.git7 || `#154706`, this.gitDarkMode = !0, this.gitDarkMode ? (this.git0 = P(this.git0, 25), this.git1 = P(this.git1, 25), this.git2 = P(this.git2, 25), this.git3 = P(this.git3, 25), this.git4 = P(this.git4, 25), this.git5 = P(this.git5, 25), this.git6 = P(this.git6, 25), this.git7 = P(this.git7, 25)) : (this.git0 = F(this.git0, 25), this.git1 = F(this.git1, 25), this.git2 = F(this.git2, 25), this.git3 = F(this.git3, 25), this.git4 = F(this.git4, 25), this.git5 = F(this.git5, 25), this.git6 = F(this.git6, 25), this.git7 = F(this.git7, 25)), this.gitInv0 = this.gitInv0 || R(this.git0), this.gitInv1 = this.gitInv1 || R(this.git1), this.gitInv2 = this.gitInv2 || R(this.git2), this.gitInv3 = this.gitInv3 || R(this.git3), this.gitInv4 = this.gitInv4 || R(this.git4), this.gitInv5 = this.gitInv5 || R(this.git5), this.gitInv6 = this.gitInv6 || R(this.git6), this.gitInv7 = this.gitInv7 || R(this.git7), this.branchLabelColor = this.branchLabelColor || (this.darkMode ? `black` : this.labelTextColor), this.gitBranchLabel0 = this.gitBranchLabel0 || this.branchLabelColor, this.gitBranchLabel1 = this.gitBranchLabel1 || this.branchLabelColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.branchLabelColor, this.gitBranchLabel3 = this.gitBranchLabel3 || this.branchLabelColor, this.gitBranchLabel4 = this.gitBranchLabel4 || this.branchLabelColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.branchLabelColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.branchLabelColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.branchLabelColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || `10px`, this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || `10px`, this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || B, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || V;
        }
        calculate(e) {
            if (typeof e != `object`) {
                this.updateColors();
                return;
            }
            let t = Object.keys(e);
            t.forEach((t)=>{
                this[t] = e[t];
            }), this.updateColors(), t.forEach((t)=>{
                this[t] = e[t];
            });
        }
    };
    Nt = t((e)=>{
        let t = new Mt;
        return t.calculate(e), t;
    }, `getThemeVariables`);
    Pt = class {
        static{
            t(this, `Theme`);
        }
        constructor(){
            this.background = `#ffffff`, this.primaryColor = `#cccccc`, this.mainBkg = `#ffffff`, this.noteBkgColor = `#fff5ad`, this.noteTextColor = `#28253D`, this.THEME_COLOR_LIMIT = 12, this.radius = 12, this.strokeWidth = 2, this.primaryBorderColor = H(`#28253D`, this.darkMode), this.fontFamily = `"Recursive Variable", arial, sans-serif`, this.fontSize = `14px`, this.nodeBorder = `#28253D`, this.stateBorder = `#28253D`, this.useGradient = !1, this.gradientStart = `#0042eb`, this.gradientStop = `#eb0042`, this.dropShadow = `url(#drop-shadow)`, this.nodeShadow = !0, this.tertiaryColor = `#ffffff`, this.clusterBkg = `#F9F9FB`, this.clusterBorder = `#BDBCCC`, this.noteBorderColor = `#FACC15`, this.archEdgeColor = `calculated`, this.archEdgeArrowColor = `calculated`, this.archEdgeWidth = `3`, this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = `2px`, this.actorBorder = `#28253D`, this.filterColor = `#000000`;
        }
        updateColors() {
            this.primaryTextColor = this.primaryTextColor || (this.darkMode ? `#eee` : `#28253D`), this.secondaryColor = this.secondaryColor || I(this.primaryColor, {
                h: -120
            }), this.tertiaryColor = this.tertiaryColor || I(this.primaryColor, {
                h: 180,
                l: 5
            }), this.primaryBorderColor = this.primaryBorderColor || H(this.primaryColor, this.darkMode), this.secondaryBorderColor = this.secondaryBorderColor || H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = this.tertiaryBorderColor || H(this.tertiaryColor, this.darkMode), this.noteBorderColor = this.noteBorderColor || H(this.noteBkgColor, this.darkMode), this.noteBkgColor = this.noteBkgColor || `#FEF9C3`, this.noteTextColor = this.noteTextColor || `#28253D`, this.secondaryTextColor = this.secondaryTextColor || R(this.secondaryColor), this.tertiaryTextColor = this.tertiaryTextColor || R(this.tertiaryColor), this.lineColor = this.lineColor || R(this.background), this.arrowheadColor = this.arrowheadColor || R(this.background), this.textColor = this.textColor || this.primaryTextColor, this.border2 = this.border2 || this.tertiaryBorderColor, this.nodeBkg = this.nodeBkg || this.primaryColor, this.mainBkg = this.mainBkg || this.primaryColor, this.nodeBorder = this.nodeBorder || this.primaryBorderColor, this.clusterBkg = this.clusterBkg || this.tertiaryColor, this.clusterBorder = this.clusterBorder || this.tertiaryBorderColor, this.defaultLinkColor = this.defaultLinkColor || this.lineColor, this.titleColor = this.titleColor || this.tertiaryTextColor, this.edgeLabelBackground = this.edgeLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.nodeTextColor = this.nodeTextColor || this.primaryTextColor, this.noteFontWeight = 600, this.actorBorder = this.actorBorder || this.primaryBorderColor, this.actorBkg = this.actorBkg || this.mainBkg, this.actorTextColor = this.actorTextColor || this.primaryTextColor, this.actorLineColor = this.actorLineColor || this.actorBorder, this.labelBoxBkgColor = this.labelBoxBkgColor || this.actorBkg, this.signalColor = this.signalColor || this.textColor, this.signalTextColor = this.signalTextColor || this.textColor, this.labelBoxBorderColor = this.labelBoxBorderColor || this.actorBorder, this.labelTextColor = this.labelTextColor || this.actorTextColor, this.loopTextColor = this.loopTextColor || this.actorTextColor, this.activationBorderColor = this.activationBorderColor || F(this.secondaryColor, 10), this.activationBkgColor = this.activationBkgColor || this.secondaryColor, this.sequenceNumberColor = this.sequenceNumberColor || R(this.lineColor), this.rectBkgColor = this.rectBkgColor || this.tertiaryColor;
            let e = `#ECECFE`, t = `#E9E9F1`, n = I(e, {
                h: 180,
                l: 5
            });
            this.sectionBkgColor = this.sectionBkgColor || n, this.altSectionBkgColor = this.altSectionBkgColor || `white`, this.sectionBkgColor = this.sectionBkgColor || t, this.sectionBkgColor2 = this.sectionBkgColor2 || e, this.excludeBkgColor = this.excludeBkgColor || `#eeeeee`, this.taskBorderColor = this.taskBorderColor || this.primaryBorderColor, this.taskBkgColor = this.taskBkgColor || e, this.activeTaskBorderColor = this.activeTaskBorderColor || e, this.activeTaskBkgColor = this.activeTaskBkgColor || P(e, 23), this.gridColor = this.gridColor || `lightgrey`, this.doneTaskBkgColor = this.doneTaskBkgColor || `lightgrey`, this.doneTaskBorderColor = this.doneTaskBorderColor || `grey`, this.critBorderColor = this.critBorderColor || `#ff8888`, this.critBkgColor = this.critBkgColor || `red`, this.todayLineColor = this.todayLineColor || `red`, this.taskTextColor = this.taskTextColor || this.textColor, this.vertLineColor = this.vertLineColor || this.primaryBorderColor, this.taskTextOutsideColor = this.taskTextOutsideColor || this.textColor, this.taskTextLightColor = this.taskTextLightColor || this.textColor, this.taskTextColor = this.taskTextColor || this.primaryTextColor, this.taskTextDarkColor = this.taskTextDarkColor || this.textColor, this.taskTextClickableColor = this.taskTextClickableColor || `#003163`, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.personBorder = this.personBorder || this.primaryBorderColor, this.personBkg = this.personBkg || this.mainBkg, this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.compositeTitleBackground = `#F9F9FB`, this.altBackground = `#F9F9FB`, this.stateEdgeLabelBackground = `#FFFFFF`, this.fontWeight = 600, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || `#f0f0f0`, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.nodeBorder, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.specialStateColor = this.lineColor;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = this.mainBkg;
            if (this.darkMode) for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 75);
            else for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 25);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleInv` + e] = this[`cScaleInv` + e] || R(this[`cScale` + e]);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this.darkMode ? this[`cScalePeer` + e] = this[`cScalePeer` + e] || P(this[`cScale` + e], 10) : this[`cScalePeer` + e] = this[`cScalePeer` + e] || F(this[`cScale` + e], 10);
            this.scaleLabelColor = this.scaleLabelColor || this.labelTextColor;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleLabel` + e] = this[`cScaleLabel` + e] || this.scaleLabelColor;
            let r = this.darkMode ? -4 : -1;
            for(let e = 0; e < 5; e++)this[`surface` + e] = this[`surface` + e] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: r * (5 + e * 3)
            }), this[`surfacePeer` + e] = this[`surfacePeer` + e] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: r * (8 + e * 3)
            });
            this.classText = this.classText || this.textColor, this.fillType0 = this.fillType0 || e, this.fillType1 = this.fillType1 || t, this.fillType2 = this.fillType2 || I(e, {
                h: 64
            }), this.fillType3 = this.fillType3 || I(t, {
                h: 64
            }), this.fillType4 = this.fillType4 || I(e, {
                h: -64
            }), this.fillType5 = this.fillType5 || I(t, {
                h: -64
            }), this.fillType6 = this.fillType6 || I(e, {
                h: 128
            }), this.fillType7 = this.fillType7 || I(t, {
                h: 128
            }), this.pie1 = this.pie1 || e, this.pie2 = this.pie2 || t, this.pie3 = this.pie3 || n, this.pie4 = this.pie4 || I(e, {
                l: -10
            }), this.pie5 = this.pie5 || I(t, {
                l: -10
            }), this.pie6 = this.pie6 || I(n, {
                l: -10
            }), this.pie7 = this.pie7 || I(e, {
                h: 60,
                l: -10
            }), this.pie8 = this.pie8 || I(e, {
                h: -60,
                l: -10
            }), this.pie9 = this.pie9 || I(e, {
                h: 120,
                l: 0
            }), this.pie10 = this.pie10 || I(e, {
                h: 60,
                l: -20
            }), this.pie11 = this.pie11 || I(e, {
                h: -60,
                l: -20
            }), this.pie12 = this.pie12 || I(e, {
                h: 120,
                l: -10
            }), this.pieTitleTextSize = this.pieTitleTextSize || `25px`, this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || `17px`, this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || `17px`, this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || `black`, this.pieStrokeWidth = this.pieStrokeWidth || `2px`, this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || `2px`, this.pieOuterStrokeColor = this.pieOuterStrokeColor || `black`, this.pieOpacity = this.pieOpacity || `0.7`, this.vennTitleTextColor = this.vennTitleTextColor ?? this.titleColor, this.vennSetTextColor = this.vennSetTextColor ?? this.textColor, this.quadrant1Fill = this.quadrant1Fill || e, this.quadrant2Fill = this.quadrant2Fill || I(e, {
                r: 5,
                g: 5,
                b: 5
            }), this.quadrant3Fill = this.quadrant3Fill || I(e, {
                r: 10,
                g: 10,
                b: 10
            }), this.quadrant4Fill = this.quadrant4Fill || I(e, {
                r: 15,
                g: 15,
                b: 15
            }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || I(this.primaryTextColor, {
                r: -5,
                g: -5,
                b: -5
            }), this.quadrant3TextFill = this.quadrant3TextFill || I(this.primaryTextColor, {
                r: -10,
                g: -10,
                b: -10
            }), this.quadrant4TextFill = this.quadrant4TextFill || I(this.primaryTextColor, {
                r: -15,
                g: -15,
                b: -15
            }), this.quadrantPointFill = this.quadrantPointFill || M(this.quadrant1Fill) ? P(this.quadrant1Fill) : F(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
                backgroundColor: this.xyChart?.backgroundColor || this.background,
                titleColor: this.xyChart?.titleColor || this.primaryTextColor,
                legendTextColor: this.xyChart?.legendTextColor || this.primaryTextColor,
                xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
                xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
                xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
                xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
                yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
                yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
                yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
                yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
                plotColorPalette: this.xyChart?.plotColorPalette || `#FFF4DD,#FFD8B1,#FFA07A,#ECEFF1,#D6DBDF,#C3E0A8,#FFB6A4,#FFD74D,#738FA7,#FFFFF0`
            }, this.requirementBackground = this.requirementBackground || e, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || `1`, this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.requirementEdgeLabelBackground = `#FFFFFF`, this.git0 = this.git0 || e, this.git1 = this.git1 || t, this.git2 = this.git2 || n, this.git3 = this.git3 || I(e, {
                h: -30
            }), this.git4 = this.git4 || I(e, {
                h: -60
            }), this.git5 = this.git5 || I(e, {
                h: -90
            }), this.git6 = this.git6 || I(e, {
                h: 60
            }), this.git7 = this.git7 || I(e, {
                h: 120
            }), this.darkMode ? (this.git0 = P(this.git0, 25), this.git1 = P(this.git1, 25), this.git2 = P(this.git2, 25), this.git3 = P(this.git3, 25), this.git4 = P(this.git4, 25), this.git5 = P(this.git5, 25), this.git6 = P(this.git6, 25), this.git7 = P(this.git7, 25)) : (this.git0 = F(this.git0, 25), this.git1 = F(this.git1, 25), this.git2 = F(this.git2, 25), this.git3 = F(this.git3, 25), this.git4 = F(this.git4, 25), this.git5 = F(this.git5, 25), this.git6 = F(this.git6, 25), this.git7 = F(this.git7, 25)), this.gitInv0 = this.gitInv0 || R(this.git0), this.gitInv1 = this.gitInv1 || R(this.git1), this.gitInv2 = this.gitInv2 || R(this.git2), this.gitInv3 = this.gitInv3 || R(this.git3), this.gitInv4 = this.gitInv4 || R(this.git4), this.gitInv5 = this.gitInv5 || R(this.git5), this.gitInv6 = this.gitInv6 || R(this.git6), this.gitInv7 = this.gitInv7 || R(this.git7), this.branchLabelColor = this.branchLabelColor || (this.darkMode ? `black` : this.labelTextColor), this.gitBranchLabel0 = this.gitBranchLabel0 || this.branchLabelColor, this.gitBranchLabel1 = this.gitBranchLabel1 || this.branchLabelColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.branchLabelColor, this.gitBranchLabel3 = this.gitBranchLabel3 || this.branchLabelColor, this.gitBranchLabel4 = this.gitBranchLabel4 || this.branchLabelColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.branchLabelColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.branchLabelColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.branchLabelColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || `10px`, this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || `10px`, this.commitLineColor = this.commitLineColor ?? `#BDBCCC`, this.erEdgeLabelBackground = `#FFFFFF`, this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || B, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || V;
        }
        calculate(e) {
            if (typeof e != `object`) {
                this.updateColors();
                return;
            }
            let t = Object.keys(e);
            t.forEach((t)=>{
                this[t] = e[t];
            }), this.updateColors(), t.forEach((t)=>{
                this[t] = e[t];
            });
        }
    };
    Ft = t((e)=>{
        let t = new Pt;
        return t.calculate(e), t;
    }, `getThemeVariables`);
    It = class {
        static{
            t(this, `Theme`);
        }
        constructor(){
            this.background = `#333`, this.primaryColor = `#1f2020`, this.secondaryColor = P(this.primaryColor, 16), this.tertiaryColor = I(this.primaryColor, {
                h: -160
            }), this.primaryBorderColor = R(this.background), this.secondaryBorderColor = H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = H(this.tertiaryColor, this.darkMode), this.primaryTextColor = R(this.primaryColor), this.secondaryTextColor = R(this.secondaryColor), this.tertiaryTextColor = R(this.tertiaryColor), this.mainBkg = `#111113`, this.secondBkg = `calculated`, this.mainContrastColor = `lightgrey`, this.darkTextColor = P(R(`#323D47`), 10), this.border1 = `#ccc`, this.border2 = j(255, 255, 255, .25), this.arrowheadColor = R(this.background), this.fontFamily = `"Recursive Variable", arial, sans-serif`, this.fontSize = `14px`, this.labelBackground = `#111113`, this.textColor = `#ccc`, this.THEME_COLOR_LIMIT = 12, this.radius = 12, this.strokeWidth = 2, this.noteBkgColor = this.noteBkgColor ?? `#FEF9C3`, this.noteTextColor = this.noteTextColor ?? `#28253D`, this.THEME_COLOR_LIMIT = 12, this.fontFamily = `"Recursive Variable", arial, sans-serif`, this.fontSize = `14px`, this.nodeBorder = `#FFFFFF`, this.stateBorder = `#FFFFFF`, this.useGradient = !1, this.gradientStart = `#0042eb`, this.gradientStop = `#eb0042`, this.dropShadow = `url(#drop-shadow)`, this.nodeShadow = !0, this.archEdgeColor = `calculated`, this.archEdgeArrowColor = `calculated`, this.archEdgeWidth = `3`, this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = `2px`, this.clusterBkg = `#1E1A2E`, this.clusterBorder = `#BDBCCC`, this.noteBorderColor = `#FACC15`, this.noteFontWeight = 600, this.filterColor = `#FFFFFF`;
        }
        updateColors() {
            if (this.primaryTextColor = this.primaryTextColor || (this.darkMode ? `#eee` : `#FFFFFF`), this.secondaryColor = this.secondaryColor || I(this.primaryColor, {
                h: -120
            }), this.tertiaryColor = this.tertiaryColor || I(this.primaryColor, {
                h: 180,
                l: 5
            }), this.primaryBorderColor = this.primaryBorderColor || H(this.primaryColor, this.darkMode), this.secondaryBorderColor = this.secondaryBorderColor || H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = this.tertiaryBorderColor || H(this.tertiaryColor, this.darkMode), this.noteBorderColor = this.noteBorderColor || H(this.noteBkgColor, this.darkMode), this.noteBkgColor = this.noteBkgColor || `#fff5ad`, this.noteTextColor = this.noteTextColor || `#FFFFFF`, this.secondaryTextColor = this.secondaryTextColor || R(this.secondaryColor), this.tertiaryTextColor = this.tertiaryTextColor || R(this.tertiaryColor), this.lineColor = this.lineColor || R(this.background), this.arrowheadColor = this.arrowheadColor || R(this.background), this.textColor = this.textColor || this.primaryTextColor, this.border2 = this.border2 || this.tertiaryBorderColor, this.nodeBkg = this.nodeBkg || this.primaryColor, this.mainBkg = this.mainBkg || this.primaryColor, this.nodeBorder = this.nodeBorder || this.border1, this.clusterBkg = this.clusterBkg || this.tertiaryColor, this.clusterBorder = this.clusterBorder || this.tertiaryBorderColor, this.defaultLinkColor = this.defaultLinkColor || this.lineColor, this.titleColor = this.titleColor || this.tertiaryTextColor, this.edgeLabelBackground = this.edgeLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.nodeTextColor = this.nodeTextColor || this.primaryTextColor, this.actorBorder = `#FFFFFF`, this.signalColor = `#FFFFFF`, this.labelBoxBorderColor = `#BDBCCC`, this.actorBorder = this.actorBorder || this.primaryBorderColor, this.actorBkg = this.actorBkg || this.mainBkg, this.actorTextColor = this.actorTextColor || this.primaryTextColor, this.actorLineColor = this.actorLineColor || this.actorBorder, this.labelBoxBkgColor = this.labelBoxBkgColor || this.actorBkg, this.signalColor = this.signalColor || this.textColor, this.signalTextColor = this.signalTextColor || this.textColor, this.labelBoxBorderColor = this.labelBoxBorderColor || this.actorBorder, this.labelTextColor = this.labelTextColor || this.actorTextColor, this.loopTextColor = this.loopTextColor || this.actorTextColor, this.activationBorderColor = this.activationBorderColor || F(this.secondaryColor, 10), this.activationBkgColor = this.activationBkgColor || this.secondaryColor, this.sequenceNumberColor = this.sequenceNumberColor || R(this.lineColor), this.rectBkgColor = this.rectBkgColor || this.tertiaryColor, this.sectionBkgColor = this.sectionBkgColor || this.tertiaryColor, this.altSectionBkgColor = this.altSectionBkgColor || `white`, this.sectionBkgColor = this.sectionBkgColor || this.secondaryColor, this.sectionBkgColor2 = this.sectionBkgColor2 || this.primaryColor, this.excludeBkgColor = this.excludeBkgColor || `#eeeeee`, this.taskBorderColor = this.taskBorderColor || this.primaryBorderColor, this.taskBkgColor = this.taskBkgColor || this.primaryColor, this.activeTaskBorderColor = this.activeTaskBorderColor || this.primaryColor, this.activeTaskBkgColor = this.activeTaskBkgColor || P(this.primaryColor, 23), this.gridColor = this.gridColor || `lightgrey`, this.doneTaskBkgColor = this.doneTaskBkgColor || `lightgrey`, this.doneTaskBorderColor = this.doneTaskBorderColor || `grey`, this.critBorderColor = this.critBorderColor || `#ff8888`, this.critBkgColor = this.critBkgColor || `red`, this.todayLineColor = this.todayLineColor || `red`, this.taskTextColor = this.taskTextColor || this.textColor, this.taskTextOutsideColor = this.taskTextOutsideColor || this.textColor, this.taskTextLightColor = this.taskTextLightColor || this.textColor, this.taskTextColor = this.taskTextColor || this.primaryTextColor, this.taskTextDarkColor = this.taskTextDarkColor || this.textColor, this.taskTextClickableColor = this.taskTextClickableColor || `#003163`, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.personBorder = this.personBorder || this.primaryBorderColor, this.personBkg = this.personBkg || this.mainBkg, this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.vertLineColor = this.vertLineColor || this.primaryBorderColor, this.compositeBackground = `#16141F`, this.altBackground = `#16141F`, this.compositeTitleBackground = `#16141F`, this.stateEdgeLabelBackground = `#16141F`, this.fontWeight = 600, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || `#f0f0f0`, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.nodeBorder, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.specialStateColor = this.lineColor, this.cScale0 = this.cScale0 || this.primaryColor, this.cScale1 = this.cScale1 || this.secondaryColor, this.cScale2 = this.cScale2 || this.tertiaryColor, this.cScale3 = this.cScale3 || I(this.primaryColor, {
                h: 30
            }), this.cScale4 = this.cScale4 || I(this.primaryColor, {
                h: 60
            }), this.cScale5 = this.cScale5 || I(this.primaryColor, {
                h: 90
            }), this.cScale6 = this.cScale6 || I(this.primaryColor, {
                h: 120
            }), this.cScale7 = this.cScale7 || I(this.primaryColor, {
                h: 150
            }), this.cScale8 = this.cScale8 || I(this.primaryColor, {
                h: 210,
                l: 150
            }), this.cScale9 = this.cScale9 || I(this.primaryColor, {
                h: 270
            }), this.cScale10 = this.cScale10 || I(this.primaryColor, {
                h: 300
            }), this.cScale11 = this.cScale11 || I(this.primaryColor, {
                h: 330
            }), this.darkMode) for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 75);
            else for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScale` + e] = F(this[`cScale` + e], 25);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleInv` + e] = this[`cScaleInv` + e] || R(this[`cScale` + e]);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this.darkMode ? this[`cScalePeer` + e] = this[`cScalePeer` + e] || P(this[`cScale` + e], 10) : this[`cScalePeer` + e] = this[`cScalePeer` + e] || F(this[`cScale` + e], 10);
            this.scaleLabelColor = this.scaleLabelColor || this.labelTextColor;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleLabel` + e] = this[`cScaleLabel` + e] || this.scaleLabelColor;
            let e = this.darkMode ? -4 : -1;
            for(let t = 0; t < 5; t++)this[`surface` + t] = this[`surface` + t] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: e * (5 + t * 3)
            }), this[`surfacePeer` + t] = this[`surfacePeer` + t] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: e * (8 + t * 3)
            });
            this.classText = this.classText || this.textColor, this.fillType0 = this.fillType0 || this.primaryColor, this.fillType1 = this.fillType1 || this.secondaryColor, this.fillType2 = this.fillType2 || I(this.primaryColor, {
                h: 64
            }), this.fillType3 = this.fillType3 || I(this.secondaryColor, {
                h: 64
            }), this.fillType4 = this.fillType4 || I(this.primaryColor, {
                h: -64
            }), this.fillType5 = this.fillType5 || I(this.secondaryColor, {
                h: -64
            }), this.fillType6 = this.fillType6 || I(this.primaryColor, {
                h: 128
            }), this.fillType7 = this.fillType7 || I(this.secondaryColor, {
                h: 128
            }), this.pie1 = this.pie1 || this.primaryColor, this.pie2 = this.pie2 || this.secondaryColor, this.pie3 = this.pie3 || this.tertiaryColor, this.pie4 = this.pie4 || I(this.primaryColor, {
                l: -10
            }), this.pie5 = this.pie5 || I(this.secondaryColor, {
                l: -10
            }), this.pie6 = this.pie6 || I(this.tertiaryColor, {
                l: -10
            }), this.pie7 = this.pie7 || I(this.primaryColor, {
                h: 60,
                l: -10
            }), this.pie8 = this.pie8 || I(this.primaryColor, {
                h: -60,
                l: -10
            }), this.pie9 = this.pie9 || I(this.primaryColor, {
                h: 120,
                l: 0
            }), this.pie10 = this.pie10 || I(this.primaryColor, {
                h: 60,
                l: -20
            }), this.pie11 = this.pie11 || I(this.primaryColor, {
                h: -60,
                l: -20
            }), this.pie12 = this.pie12 || I(this.primaryColor, {
                h: 120,
                l: -10
            }), this.pieTitleTextSize = this.pieTitleTextSize || `25px`, this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || `17px`, this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || `17px`, this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || `black`, this.pieStrokeWidth = this.pieStrokeWidth || `2px`, this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || `2px`, this.pieOuterStrokeColor = this.pieOuterStrokeColor || `black`, this.pieOpacity = this.pieOpacity || `0.7`, this.vennTitleTextColor = this.vennTitleTextColor ?? this.titleColor, this.vennSetTextColor = this.vennSetTextColor ?? this.textColor, this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || I(this.primaryColor, {
                r: 5,
                g: 5,
                b: 5
            }), this.quadrant3Fill = this.quadrant3Fill || I(this.primaryColor, {
                r: 10,
                g: 10,
                b: 10
            }), this.quadrant4Fill = this.quadrant4Fill || I(this.primaryColor, {
                r: 15,
                g: 15,
                b: 15
            }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || I(this.primaryTextColor, {
                r: -5,
                g: -5,
                b: -5
            }), this.quadrant3TextFill = this.quadrant3TextFill || I(this.primaryTextColor, {
                r: -10,
                g: -10,
                b: -10
            }), this.quadrant4TextFill = this.quadrant4TextFill || I(this.primaryTextColor, {
                r: -15,
                g: -15,
                b: -15
            }), this.quadrantPointFill = this.quadrantPointFill || M(this.quadrant1Fill) ? P(this.quadrant1Fill) : F(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
                backgroundColor: this.xyChart?.backgroundColor || this.background,
                titleColor: this.xyChart?.titleColor || this.primaryTextColor,
                legendTextColor: this.xyChart?.legendTextColor || this.primaryTextColor,
                xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
                xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
                xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
                xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
                yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
                yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
                yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
                yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
                plotColorPalette: this.xyChart?.plotColorPalette || `#FFF4DD,#FFD8B1,#FFA07A,#ECEFF1,#D6DBDF,#C3E0A8,#FFB6A4,#FFD74D,#738FA7,#FFFFF0`
            }, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || `1`, this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.requirementEdgeLabelBackground = `#16141F`, this.git0 = this.git0 || this.primaryColor, this.git1 = this.git1 || this.secondaryColor, this.git2 = this.git2 || this.tertiaryColor, this.git3 = this.git3 || I(this.primaryColor, {
                h: -30
            }), this.git4 = this.git4 || I(this.primaryColor, {
                h: -60
            }), this.git5 = this.git5 || I(this.primaryColor, {
                h: -90
            }), this.git6 = this.git6 || I(this.primaryColor, {
                h: 60
            }), this.git7 = this.git7 || I(this.primaryColor, {
                h: 120
            }), this.darkMode ? (this.git0 = P(this.git0, 25), this.git1 = P(this.git1, 25), this.git2 = P(this.git2, 25), this.git3 = P(this.git3, 25), this.git4 = P(this.git4, 25), this.git5 = P(this.git5, 25), this.git6 = P(this.git6, 25), this.git7 = P(this.git7, 25)) : (this.git0 = F(this.git0, 25), this.git1 = F(this.git1, 25), this.git2 = F(this.git2, 25), this.git3 = F(this.git3, 25), this.git4 = F(this.git4, 25), this.git5 = F(this.git5, 25), this.git6 = F(this.git6, 25), this.git7 = F(this.git7, 25)), this.gitInv0 = this.gitInv0 || R(this.git0), this.gitInv1 = this.gitInv1 || R(this.git1), this.gitInv2 = this.gitInv2 || R(this.git2), this.gitInv3 = this.gitInv3 || R(this.git3), this.gitInv4 = this.gitInv4 || R(this.git4), this.gitInv5 = this.gitInv5 || R(this.git5), this.gitInv6 = this.gitInv6 || R(this.git6), this.gitInv7 = this.gitInv7 || R(this.git7), this.branchLabelColor = this.branchLabelColor || (this.darkMode ? `black` : this.labelTextColor), this.gitBranchLabel0 = this.gitBranchLabel0 || this.branchLabelColor, this.gitBranchLabel1 = this.gitBranchLabel1 || this.branchLabelColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.branchLabelColor, this.gitBranchLabel3 = this.gitBranchLabel3 || this.branchLabelColor, this.gitBranchLabel4 = this.gitBranchLabel4 || this.branchLabelColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.branchLabelColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.branchLabelColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.branchLabelColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || `10px`, this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || `10px`, this.commitLineColor = this.commitLineColor ?? `#BDBCCC`, this.erEdgeLabelBackground = `#16141F`, this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || B, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || V;
        }
        calculate(e) {
            if (typeof e != `object`) {
                this.updateColors();
                return;
            }
            let t = Object.keys(e);
            t.forEach((t)=>{
                this[t] = e[t];
            }), this.updateColors(), t.forEach((t)=>{
                this[t] = e[t];
            });
        }
    };
    Lt = t((e)=>{
        let t = new It;
        return t.calculate(e), t;
    }, `getThemeVariables`);
    Rt = class {
        static{
            t(this, `Theme`);
        }
        constructor(){
            this.background = `#ffffff`, this.primaryColor = `#cccccc`, this.mainBkg = `#ffffff`, this.noteBkgColor = `#fff5ad`, this.noteTextColor = `#28253D`, this.THEME_COLOR_LIMIT = 12, this.radius = 12, this.strokeWidth = 2, this.primaryBorderColor = H(this.primaryColor, this.darkMode), this.fontFamily = `"Recursive Variable", arial, sans-serif`, this.fontSize = `14px`, this.nodeBorder = `#28253D`, this.stateBorder = `#28253D`, this.useGradient = !1, this.gradientStart = `#0042eb`, this.gradientStop = `#eb0042`, this.dropShadow = `url(#drop-shadow)`, this.nodeShadow = !0, this.tertiaryColor = `#ffffff`, this.archEdgeColor = `calculated`, this.archEdgeArrowColor = `calculated`, this.archEdgeWidth = `3`, this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = `2px`, this.actorBorder = `#28253D`, this.noteBorderColor = `#FACC15`, this.noteFontWeight = 600, this.borderColorArray = [
                `#E879F9`,
                `#2DD4BF`,
                `#FB923C`,
                `#22D3EE`,
                `#4ADE80`,
                `#A78BFA`,
                `#F87171`,
                `#FACC15`,
                `#818CF8`,
                `#A3E635 `,
                `#38BDF8`,
                `#FB7185`
            ], this.bkgColorArray = [
                `#FDF4FF`,
                `#F0FDFA`,
                `#FFF7ED`,
                `#ECFEFF`,
                `#F0FDF4`,
                `#F5F3FF`,
                `#FEF2F2`,
                `#FEFCE8`,
                `#EEF2FF`,
                `#F7FEE7`,
                `#F0F9FF`,
                `#FFF1F2`
            ], this.filterColor = `#000000`;
        }
        updateColors() {
            this.primaryTextColor = this.primaryTextColor || (this.darkMode ? `#eee` : `#28253D`), this.secondaryColor = this.secondaryColor || I(this.primaryColor, {
                h: -120
            }), this.tertiaryColor = this.tertiaryColor || I(this.primaryColor, {
                h: 180,
                l: 5
            }), this.primaryBorderColor = this.primaryBorderColor || H(this.primaryColor, this.darkMode), this.secondaryBorderColor = this.secondaryBorderColor || H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = this.tertiaryBorderColor || H(this.tertiaryColor, this.darkMode), this.noteBorderColor = this.noteBorderColor || H(this.noteBkgColor, this.darkMode), this.noteBkgColor = this.noteBkgColor || `#fff5ad`, this.noteTextColor = this.noteTextColor || `#28253D`, this.secondaryTextColor = this.secondaryTextColor || R(this.secondaryColor), this.tertiaryTextColor = this.tertiaryTextColor || R(this.tertiaryColor), this.lineColor = this.lineColor || R(this.background), this.arrowheadColor = this.arrowheadColor || R(this.background), this.textColor = this.textColor || this.primaryTextColor, this.border2 = this.border2 || this.tertiaryBorderColor, this.nodeBkg = this.nodeBkg || this.primaryColor, this.mainBkg = this.mainBkg || this.primaryColor, this.nodeBorder = this.nodeBorder || this.primaryBorderColor, this.clusterBkg = this.clusterBkg || this.tertiaryColor, this.clusterBorder = this.clusterBorder || this.tertiaryBorderColor, this.defaultLinkColor = this.defaultLinkColor || this.lineColor, this.titleColor = this.titleColor || this.tertiaryTextColor, this.edgeLabelBackground = this.edgeLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.nodeTextColor = this.nodeTextColor || this.primaryTextColor, this.actorBorder = this.actorBorder || this.primaryBorderColor, this.actorBkg = this.actorBkg || this.mainBkg, this.actorTextColor = this.actorTextColor || this.primaryTextColor, this.actorLineColor = this.actorLineColor || this.actorBorder, this.labelBoxBkgColor = this.labelBoxBkgColor || this.actorBkg, this.signalColor = this.signalColor || this.textColor, this.signalTextColor = this.signalTextColor || this.textColor, this.labelBoxBorderColor = this.labelBoxBorderColor || this.actorBorder, this.labelTextColor = this.labelTextColor || this.actorTextColor, this.loopTextColor = this.loopTextColor || this.actorTextColor, this.activationBorderColor = this.activationBorderColor || F(this.secondaryColor, 10), this.activationBkgColor = this.activationBkgColor || this.secondaryColor, this.sequenceNumberColor = this.sequenceNumberColor || R(this.lineColor), this.rectBkgColor = this.rectBkgColor || this.tertiaryColor;
            let e = `#ECECFE`, t = `#E9E9F1`, n = I(e, {
                h: 180,
                l: 5
            });
            this.sectionBkgColor = this.sectionBkgColor || n, this.altSectionBkgColor = this.altSectionBkgColor || `white`, this.sectionBkgColor = this.sectionBkgColor || t, this.sectionBkgColor2 = this.sectionBkgColor2 || e, this.excludeBkgColor = this.excludeBkgColor || `#eeeeee`, this.taskBorderColor = this.taskBorderColor || this.primaryBorderColor, this.taskBkgColor = this.taskBkgColor || e, this.activeTaskBorderColor = this.activeTaskBorderColor || e, this.activeTaskBkgColor = this.activeTaskBkgColor || P(e, 23), this.gridColor = this.gridColor || `lightgrey`, this.doneTaskBkgColor = this.doneTaskBkgColor || `lightgrey`, this.doneTaskBorderColor = this.doneTaskBorderColor || `grey`, this.critBorderColor = this.critBorderColor || `#ff8888`, this.critBkgColor = this.critBkgColor || `red`, this.todayLineColor = this.todayLineColor || `red`, this.taskTextColor = this.taskTextColor || this.textColor, this.vertLineColor = this.vertLineColor || this.primaryBorderColor, this.taskTextOutsideColor = this.taskTextOutsideColor || this.textColor, this.taskTextLightColor = this.taskTextLightColor || this.textColor, this.taskTextColor = this.taskTextColor || this.primaryTextColor, this.taskTextDarkColor = this.taskTextDarkColor || this.textColor, this.taskTextClickableColor = this.taskTextClickableColor || `#003163`, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.personBorder = this.personBorder || this.primaryBorderColor, this.personBkg = this.personBkg || this.mainBkg, this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || `#f0f0f0`, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.nodeBorder, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.specialStateColor = this.lineColor, this.cScale0 = this.cScale0 || `#f4a8ff`, this.cScale1 = this.cScale1 || `#46ecd5`, this.cScale2 = this.cScale2 || `#ffb86a`, this.cScale3 = this.cScale3 || `#dab2ff`, this.cScale4 = this.cScale4 || `#7bf1a8`, this.cScale5 = this.cScale5 || `#c4b4ff`, this.cScale6 = this.cScale6 || `#ffa2a2`, this.cScale7 = this.cScale7 || `#ffdf20`, this.cScale8 = this.cScale8 || `#a3b3ff`, this.cScale9 = this.cScale9 || `#bbf451`, this.cScale10 = this.cScale10 || `#74d4ff`, this.cScale11 = this.cScale11 || `#ffa1ad`;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleInv` + e] = this[`cScaleInv` + e] || R(this[`cScale` + e]);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this.darkMode ? this[`cScalePeer` + e] = this[`cScalePeer` + e] || P(this[`cScale` + e], 10) : this[`cScalePeer` + e] = this[`cScalePeer` + e] || F(this[`cScale` + e], 10);
            this.scaleLabelColor = this.scaleLabelColor || this.labelTextColor;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleLabel` + e] = this[`cScaleLabel` + e] || this.scaleLabelColor;
            let r = this.darkMode ? -4 : -1;
            for(let e = 0; e < 5; e++)this[`surface` + e] = this[`surface` + e] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: r * (5 + e * 3)
            }), this[`surfacePeer` + e] = this[`surfacePeer` + e] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: r * (8 + e * 3)
            });
            this.classText = this.classText || this.textColor, this.fillType0 = this.fillType0 || e, this.fillType1 = this.fillType1 || t, this.fillType2 = this.fillType2 || I(e, {
                h: 64
            }), this.fillType3 = this.fillType3 || I(t, {
                h: 64
            }), this.fillType4 = this.fillType4 || I(e, {
                h: -64
            }), this.fillType5 = this.fillType5 || I(t, {
                h: -64
            }), this.fillType6 = this.fillType6 || I(e, {
                h: 128
            }), this.fillType7 = this.fillType7 || I(t, {
                h: 128
            }), this.pie1 = this.pie1 || e, this.pie2 = this.pie2 || t, this.pie3 = this.pie3 || n, this.pie4 = this.pie4 || I(e, {
                l: -10
            }), this.pie5 = this.pie5 || I(t, {
                l: -10
            }), this.pie6 = this.pie6 || I(n, {
                l: -10
            }), this.pie7 = this.pie7 || I(e, {
                h: 60,
                l: -10
            }), this.pie8 = this.pie8 || I(e, {
                h: -60,
                l: -10
            }), this.pie9 = this.pie9 || I(e, {
                h: 120,
                l: 0
            }), this.pie10 = this.pie10 || I(e, {
                h: 60,
                l: -20
            }), this.pie11 = this.pie11 || I(e, {
                h: -60,
                l: -20
            }), this.pie12 = this.pie12 || I(e, {
                h: 120,
                l: -10
            }), this.pieTitleTextSize = this.pieTitleTextSize || `25px`, this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || `17px`, this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || `17px`, this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || `black`, this.pieStrokeWidth = this.pieStrokeWidth || `2px`, this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || `2px`, this.pieOuterStrokeColor = this.pieOuterStrokeColor || `black`, this.pieOpacity = this.pieOpacity || `0.7`, this.vennTitleTextColor = this.vennTitleTextColor ?? this.titleColor, this.vennSetTextColor = this.vennSetTextColor ?? this.textColor, this.quadrant1Fill = this.quadrant1Fill || e, this.quadrant2Fill = this.quadrant2Fill || I(e, {
                r: 5,
                g: 5,
                b: 5
            }), this.quadrant3Fill = this.quadrant3Fill || I(e, {
                r: 10,
                g: 10,
                b: 10
            }), this.quadrant4Fill = this.quadrant4Fill || I(e, {
                r: 15,
                g: 15,
                b: 15
            }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || I(this.primaryTextColor, {
                r: -5,
                g: -5,
                b: -5
            }), this.quadrant3TextFill = this.quadrant3TextFill || I(this.primaryTextColor, {
                r: -10,
                g: -10,
                b: -10
            }), this.quadrant4TextFill = this.quadrant4TextFill || I(this.primaryTextColor, {
                r: -15,
                g: -15,
                b: -15
            }), this.quadrantPointFill = this.quadrantPointFill || M(this.quadrant1Fill) ? P(this.quadrant1Fill) : F(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
                backgroundColor: this.xyChart?.backgroundColor || this.background,
                titleColor: this.xyChart?.titleColor || this.primaryTextColor,
                legendTextColor: this.xyChart?.legendTextColor || this.primaryTextColor,
                xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
                xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
                xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
                xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
                yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
                yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
                yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
                yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
                plotColorPalette: this.xyChart?.plotColorPalette || `#FFF4DD,#FFD8B1,#FFA07A,#ECEFF1,#D6DBDF,#C3E0A8,#FFB6A4,#FFD74D,#738FA7,#FFFFF0`
            }, this.requirementBackground = this.requirementBackground || e, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || `1`, this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = this.git0 || e, this.git1 = this.git1 || t, this.git2 = this.git2 || n, this.git3 = this.git3 || I(e, {
                h: -30
            }), this.git4 = this.git4 || I(e, {
                h: -60
            }), this.git5 = this.git5 || I(e, {
                h: -90
            }), this.git6 = this.git6 || I(e, {
                h: 60
            }), this.git7 = this.git7 || I(e, {
                h: 120
            }), this.darkMode ? (this.git0 = P(this.git0, 25), this.git1 = P(this.git1, 25), this.git2 = P(this.git2, 25), this.git3 = P(this.git3, 25), this.git4 = P(this.git4, 25), this.git5 = P(this.git5, 25), this.git6 = P(this.git6, 25), this.git7 = P(this.git7, 25)) : (this.git0 = F(this.git0, 25), this.git1 = F(this.git1, 25), this.git2 = F(this.git2, 25), this.git3 = F(this.git3, 25), this.git4 = F(this.git4, 25), this.git5 = F(this.git5, 25), this.git6 = F(this.git6, 25), this.git7 = F(this.git7, 25)), this.gitInv0 = this.gitInv0 || R(this.git0), this.gitInv1 = this.gitInv1 || R(this.git1), this.gitInv2 = this.gitInv2 || R(this.git2), this.gitInv3 = this.gitInv3 || R(this.git3), this.gitInv4 = this.gitInv4 || R(this.git4), this.gitInv5 = this.gitInv5 || R(this.git5), this.gitInv6 = this.gitInv6 || R(this.git6), this.gitInv7 = this.gitInv7 || R(this.git7), this.branchLabelColor = this.branchLabelColor || (this.darkMode ? `black` : this.labelTextColor), this.gitBranchLabel0 = this.gitBranchLabel0 || this.branchLabelColor, this.gitBranchLabel1 = this.gitBranchLabel1 || this.branchLabelColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.branchLabelColor, this.gitBranchLabel3 = this.gitBranchLabel3 || this.branchLabelColor, this.gitBranchLabel4 = this.gitBranchLabel4 || this.branchLabelColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.branchLabelColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.branchLabelColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.branchLabelColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || `10px`, this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLineColor = this.commitLineColor ?? `#BDBCCC`, this.commitLabelFontSize = this.commitLabelFontSize || `10px`, this.fontWeight = 600, this.erEdgeLabelBackground = `#FFFFFF`, this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || B, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || V;
        }
        calculate(e) {
            if (typeof e != `object`) {
                this.updateColors();
                return;
            }
            let t = Object.keys(e);
            t.forEach((t)=>{
                this[t] = e[t];
            }), this.updateColors(), t.forEach((t)=>{
                this[t] = e[t];
            });
        }
    };
    zt = t((e)=>{
        let t = new Rt;
        return t.calculate(e), t;
    }, `getThemeVariables`);
    Bt = class {
        static{
            t(this, `Theme`);
        }
        constructor(){
            this.background = `#333`, this.primaryColor = `#1f2020`, this.secondaryColor = P(this.primaryColor, 16), this.tertiaryColor = I(this.primaryColor, {
                h: -160
            }), this.primaryBorderColor = R(this.background), this.secondaryBorderColor = H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = H(this.tertiaryColor, this.darkMode), this.primaryTextColor = R(this.primaryColor), this.secondaryTextColor = R(this.secondaryColor), this.tertiaryTextColor = R(this.tertiaryColor), this.mainBkg = `#111113`, this.secondBkg = `calculated`, this.mainContrastColor = `lightgrey`, this.darkTextColor = P(R(`#323D47`), 10), this.border1 = `#ccc`, this.border2 = j(255, 255, 255, .25), this.arrowheadColor = R(this.background), this.fontFamily = `"Recursive Variable", arial, sans-serif`, this.fontSize = `14px`, this.labelBackground = `#111113`, this.textColor = `#ccc`, this.THEME_COLOR_LIMIT = 12, this.radius = 12, this.strokeWidth = 2, this.noteBkgColor = this.noteBkgColor ?? `#FEF9C3`, this.noteTextColor = this.noteTextColor ?? `#28253D`, this.THEME_COLOR_LIMIT = 12, this.fontFamily = `"Recursive Variable", arial, sans-serif`, this.fontSize = `14px`, this.nodeBorder = `#FFFFFF`, this.stateBorder = `#FFFFFF`, this.useGradient = !1, this.gradientStart = `#0042eb`, this.gradientStop = `#eb0042`, this.dropShadow = `url(#drop-shadow)`, this.nodeShadow = !0, this.archEdgeColor = `calculated`, this.archEdgeArrowColor = `calculated`, this.archEdgeWidth = `3`, this.archGroupBorderColor = this.primaryBorderColor, this.archGroupBorderWidth = `2px`, this.clusterBkg = `#1E1A2E`, this.clusterBorder = `#BDBCCC`, this.noteBorderColor = `#FACC15`, this.noteFontWeight = 600, this.borderColorArray = [
                `#E879F9`,
                `#2DD4BF`,
                `#FB923C`,
                `#22D3EE`,
                `#4ADE80`,
                `#A78BFA`,
                `#F87171`,
                `#FACC15`,
                `#818CF8`,
                `#A3E635 `,
                `#38BDF8`,
                `#FB7185`
            ], this.bkgColorArray = [], this.filterColor = `#FFFFFF`;
        }
        updateColors() {
            this.primaryTextColor = this.primaryTextColor || (this.darkMode ? `#eee` : `#FFFFFF`), this.secondaryColor = this.secondaryColor || I(this.primaryColor, {
                h: -120
            }), this.tertiaryColor = this.tertiaryColor || I(this.primaryColor, {
                h: 180,
                l: 5
            }), this.primaryBorderColor = this.primaryBorderColor || H(this.primaryColor, this.darkMode), this.secondaryBorderColor = this.secondaryBorderColor || H(this.secondaryColor, this.darkMode), this.tertiaryBorderColor = this.tertiaryBorderColor || H(this.tertiaryColor, this.darkMode), this.noteBorderColor = this.noteBorderColor || H(this.noteBkgColor, this.darkMode), this.noteBkgColor = this.noteBkgColor || `#fff5ad`, this.noteTextColor = this.noteTextColor || `#FFFFFF`, this.secondaryTextColor = this.secondaryTextColor || R(this.secondaryColor), this.tertiaryTextColor = this.tertiaryTextColor || R(this.tertiaryColor), this.lineColor = this.lineColor || R(this.background), this.arrowheadColor = this.arrowheadColor || R(this.background), this.textColor = this.textColor || this.primaryTextColor, this.border2 = this.border2 || this.tertiaryBorderColor, this.nodeBkg = this.nodeBkg || this.primaryColor, this.mainBkg = this.mainBkg || this.primaryColor, this.nodeBorder = this.nodeBorder || this.border1, this.clusterBkg = this.clusterBkg || this.tertiaryColor, this.clusterBorder = this.clusterBorder || this.tertiaryBorderColor, this.defaultLinkColor = this.defaultLinkColor || this.lineColor, this.titleColor = this.titleColor || this.tertiaryTextColor, this.edgeLabelBackground = this.edgeLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.nodeTextColor = this.nodeTextColor || this.primaryTextColor, this.actorBorder = `#FFFFFF`, this.signalColor = `#FFFFFF`, this.labelBoxBorderColor = `#BDBCCC`, this.actorBorder = this.actorBorder || this.primaryBorderColor, this.actorBkg = this.actorBkg || this.mainBkg, this.actorTextColor = this.actorTextColor || this.primaryTextColor, this.actorLineColor = this.actorLineColor || this.actorBorder, this.labelBoxBkgColor = this.labelBoxBkgColor || this.actorBkg, this.signalColor = this.signalColor || this.textColor, this.signalTextColor = this.signalTextColor || this.textColor, this.labelBoxBorderColor = this.labelBoxBorderColor || this.actorBorder, this.labelTextColor = this.labelTextColor || this.actorTextColor, this.loopTextColor = this.loopTextColor || this.actorTextColor, this.activationBorderColor = this.activationBorderColor || F(this.secondaryColor, 10), this.activationBkgColor = this.activationBkgColor || this.secondaryColor, this.sequenceNumberColor = this.sequenceNumberColor || R(this.lineColor), this.rectBkgColor = this.rectBkgColor || this.tertiaryColor, this.rootLabelColor = `#FFFFFF`, this.sectionBkgColor = this.sectionBkgColor || this.tertiaryColor, this.altSectionBkgColor = this.altSectionBkgColor || `white`, this.sectionBkgColor = this.sectionBkgColor || this.secondaryColor, this.sectionBkgColor2 = this.sectionBkgColor2 || this.primaryColor, this.excludeBkgColor = this.excludeBkgColor || `#eeeeee`, this.taskBorderColor = this.taskBorderColor || this.primaryBorderColor, this.taskBkgColor = this.taskBkgColor || this.primaryColor, this.activeTaskBorderColor = this.activeTaskBorderColor || this.primaryColor, this.activeTaskBkgColor = this.activeTaskBkgColor || P(this.primaryColor, 23), this.gridColor = this.gridColor || `lightgrey`, this.doneTaskBkgColor = this.doneTaskBkgColor || `lightgrey`, this.doneTaskBorderColor = this.doneTaskBorderColor || `grey`, this.critBorderColor = this.critBorderColor || `#ff8888`, this.critBkgColor = this.critBkgColor || `red`, this.todayLineColor = this.todayLineColor || `red`, this.taskTextColor = this.taskTextColor || this.textColor, this.vertLineColor = this.vertLineColor || this.primaryBorderColor, this.taskTextOutsideColor = this.taskTextOutsideColor || this.textColor, this.taskTextLightColor = this.taskTextLightColor || this.textColor, this.taskTextColor = this.taskTextColor || this.primaryTextColor, this.taskTextDarkColor = this.taskTextDarkColor || this.textColor, this.taskTextClickableColor = this.taskTextClickableColor || `#003163`, this.archEdgeColor = this.lineColor, this.archEdgeArrowColor = this.lineColor, this.personBorder = this.personBorder || this.primaryBorderColor, this.personBkg = this.personBkg || this.mainBkg, this.transitionColor = this.transitionColor || this.lineColor, this.transitionLabelColor = this.transitionLabelColor || this.textColor, this.stateLabelColor = this.stateLabelColor || this.stateBkg || this.primaryTextColor, this.stateBkg = this.stateBkg || this.mainBkg, this.labelBackgroundColor = this.labelBackgroundColor || this.stateBkg, this.compositeBackground = this.compositeBackground || this.background || this.tertiaryColor, this.altBackground = this.altBackground || `#f0f0f0`, this.compositeTitleBackground = this.compositeTitleBackground || this.mainBkg, this.compositeBorder = this.compositeBorder || this.nodeBorder, this.innerEndBackground = this.nodeBorder, this.errorBkgColor = this.errorBkgColor || this.tertiaryColor, this.errorTextColor = this.errorTextColor || this.tertiaryTextColor, this.transitionColor = this.transitionColor || this.lineColor, this.specialStateColor = this.lineColor, this.cScale0 = this.cScale0 || `#f4a8ff`, this.cScale1 = this.cScale1 || `#46ecd5`, this.cScale2 = this.cScale2 || `#ffb86a`, this.cScale3 = this.cScale3 || `#dab2ff`, this.cScale4 = this.cScale4 || `#7bf1a8`, this.cScale5 = this.cScale5 || `#c4b4ff`, this.cScale6 = this.cScale6 || `#ffa2a2`, this.cScale7 = this.cScale7 || `#ffdf20`, this.cScale8 = this.cScale8 || `#a3b3ff`, this.cScale9 = this.cScale9 || `#bbf451`, this.cScale10 = this.cScale10 || `#74d4ff`, this.cScale11 = this.cScale11 || `#ffa1ad`;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleInv` + e] = this[`cScaleInv` + e] || R(this[`cScale` + e]);
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this.darkMode ? this[`cScalePeer` + e] = this[`cScalePeer` + e] || P(this[`cScale` + e], 10) : this[`cScalePeer` + e] = this[`cScalePeer` + e] || F(this[`cScale` + e], 10);
            this.scaleLabelColor = this.scaleLabelColor || this.labelTextColor;
            for(let e = 0; e < this.THEME_COLOR_LIMIT; e++)this[`cScaleLabel` + e] = F(this[`cScale` + e], 75);
            let e = this.darkMode ? -4 : -1;
            for(let t = 0; t < 5; t++)this[`surface` + t] = this[`surface` + t] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: e * (5 + t * 3)
            }), this[`surfacePeer` + t] = this[`surfacePeer` + t] || I(this.mainBkg, {
                h: 180,
                s: -15,
                l: e * (8 + t * 3)
            });
            this.classText = this.classText || this.textColor, this.fillType0 = this.fillType0 || this.primaryColor, this.fillType1 = this.fillType1 || this.secondaryColor, this.fillType2 = this.fillType2 || I(this.primaryColor, {
                h: 64
            }), this.fillType3 = this.fillType3 || I(this.secondaryColor, {
                h: 64
            }), this.fillType4 = this.fillType4 || I(this.primaryColor, {
                h: -64
            }), this.fillType5 = this.fillType5 || I(this.secondaryColor, {
                h: -64
            }), this.fillType6 = this.fillType6 || I(this.primaryColor, {
                h: 128
            }), this.fillType7 = this.fillType7 || I(this.secondaryColor, {
                h: 128
            }), this.pie1 = this.pie1 || this.primaryColor, this.pie2 = this.pie2 || this.secondaryColor, this.pie3 = this.pie3 || this.tertiaryColor, this.pie4 = this.pie4 || I(this.primaryColor, {
                l: -10
            }), this.pie5 = this.pie5 || I(this.secondaryColor, {
                l: -10
            }), this.pie6 = this.pie6 || I(this.tertiaryColor, {
                l: -10
            }), this.pie7 = this.pie7 || I(this.primaryColor, {
                h: 60,
                l: -10
            }), this.pie8 = this.pie8 || I(this.primaryColor, {
                h: -60,
                l: -10
            }), this.pie9 = this.pie9 || I(this.primaryColor, {
                h: 120,
                l: 0
            }), this.pie10 = this.pie10 || I(this.primaryColor, {
                h: 60,
                l: -20
            }), this.pie11 = this.pie11 || I(this.primaryColor, {
                h: -60,
                l: -20
            }), this.pie12 = this.pie12 || I(this.primaryColor, {
                h: 120,
                l: -10
            }), this.pieTitleTextSize = this.pieTitleTextSize || `25px`, this.pieTitleTextColor = this.pieTitleTextColor || this.taskTextDarkColor, this.pieSectionTextSize = this.pieSectionTextSize || `17px`, this.pieSectionTextColor = this.pieSectionTextColor || this.textColor, this.pieLegendTextSize = this.pieLegendTextSize || `17px`, this.pieLegendTextColor = this.pieLegendTextColor || this.taskTextDarkColor, this.pieStrokeColor = this.pieStrokeColor || `black`, this.pieStrokeWidth = this.pieStrokeWidth || `2px`, this.pieOuterStrokeWidth = this.pieOuterStrokeWidth || `2px`, this.pieOuterStrokeColor = this.pieOuterStrokeColor || `black`, this.pieOpacity = this.pieOpacity || `0.7`, this.vennTitleTextColor = this.vennTitleTextColor ?? this.titleColor, this.vennSetTextColor = this.vennSetTextColor ?? this.textColor, this.quadrant1Fill = this.quadrant1Fill || this.primaryColor, this.quadrant2Fill = this.quadrant2Fill || I(this.primaryColor, {
                r: 5,
                g: 5,
                b: 5
            }), this.quadrant3Fill = this.quadrant3Fill || I(this.primaryColor, {
                r: 10,
                g: 10,
                b: 10
            }), this.quadrant4Fill = this.quadrant4Fill || I(this.primaryColor, {
                r: 15,
                g: 15,
                b: 15
            }), this.quadrant1TextFill = this.quadrant1TextFill || this.primaryTextColor, this.quadrant2TextFill = this.quadrant2TextFill || I(this.primaryTextColor, {
                r: -5,
                g: -5,
                b: -5
            }), this.quadrant3TextFill = this.quadrant3TextFill || I(this.primaryTextColor, {
                r: -10,
                g: -10,
                b: -10
            }), this.quadrant4TextFill = this.quadrant4TextFill || I(this.primaryTextColor, {
                r: -15,
                g: -15,
                b: -15
            }), this.quadrantPointFill = this.quadrantPointFill || M(this.quadrant1Fill) ? P(this.quadrant1Fill) : F(this.quadrant1Fill), this.quadrantPointTextFill = this.quadrantPointTextFill || this.primaryTextColor, this.quadrantXAxisTextFill = this.quadrantXAxisTextFill || this.primaryTextColor, this.quadrantYAxisTextFill = this.quadrantYAxisTextFill || this.primaryTextColor, this.quadrantInternalBorderStrokeFill = this.quadrantInternalBorderStrokeFill || this.primaryBorderColor, this.quadrantExternalBorderStrokeFill = this.quadrantExternalBorderStrokeFill || this.primaryBorderColor, this.quadrantTitleFill = this.quadrantTitleFill || this.primaryTextColor, this.xyChart = {
                backgroundColor: this.xyChart?.backgroundColor || this.background,
                titleColor: this.xyChart?.titleColor || this.primaryTextColor,
                legendTextColor: this.xyChart?.legendTextColor || this.primaryTextColor,
                xAxisTitleColor: this.xyChart?.xAxisTitleColor || this.primaryTextColor,
                xAxisLabelColor: this.xyChart?.xAxisLabelColor || this.primaryTextColor,
                xAxisTickColor: this.xyChart?.xAxisTickColor || this.primaryTextColor,
                xAxisLineColor: this.xyChart?.xAxisLineColor || this.primaryTextColor,
                yAxisTitleColor: this.xyChart?.yAxisTitleColor || this.primaryTextColor,
                yAxisLabelColor: this.xyChart?.yAxisLabelColor || this.primaryTextColor,
                yAxisTickColor: this.xyChart?.yAxisTickColor || this.primaryTextColor,
                yAxisLineColor: this.xyChart?.yAxisLineColor || this.primaryTextColor,
                plotColorPalette: this.xyChart?.plotColorPalette || `#FFF4DD,#FFD8B1,#FFA07A,#ECEFF1,#D6DBDF,#C3E0A8,#FFB6A4,#FFD74D,#738FA7,#FFFFF0`
            }, this.requirementBackground = this.requirementBackground || this.primaryColor, this.requirementBorderColor = this.requirementBorderColor || this.primaryBorderColor, this.requirementBorderSize = this.requirementBorderSize || `1`, this.requirementTextColor = this.requirementTextColor || this.primaryTextColor, this.relationColor = this.relationColor || this.lineColor, this.relationLabelBackground = this.relationLabelBackground || (this.darkMode ? F(this.secondaryColor, 30) : this.secondaryColor), this.relationLabelColor = this.relationLabelColor || this.actorTextColor, this.git0 = this.git0 || this.primaryColor, this.git1 = this.git1 || this.secondaryColor, this.git2 = this.git2 || this.tertiaryColor, this.git3 = this.git3 || I(this.primaryColor, {
                h: -30
            }), this.git4 = this.git4 || I(this.primaryColor, {
                h: -60
            }), this.git5 = this.git5 || I(this.primaryColor, {
                h: -90
            }), this.git6 = this.git6 || I(this.primaryColor, {
                h: 60
            }), this.git7 = this.git7 || I(this.primaryColor, {
                h: 120
            }), this.darkMode ? (this.git0 = P(this.git0, 25), this.git1 = P(this.git1, 25), this.git2 = P(this.git2, 25), this.git3 = P(this.git3, 25), this.git4 = P(this.git4, 25), this.git5 = P(this.git5, 25), this.git6 = P(this.git6, 25), this.git7 = P(this.git7, 25)) : (this.git0 = F(this.git0, 25), this.git1 = F(this.git1, 25), this.git2 = F(this.git2, 25), this.git3 = F(this.git3, 25), this.git4 = F(this.git4, 25), this.git5 = F(this.git5, 25), this.git6 = F(this.git6, 25), this.git7 = F(this.git7, 25)), this.gitInv0 = this.gitInv0 || R(this.git0), this.gitInv1 = this.gitInv1 || R(this.git1), this.gitInv2 = this.gitInv2 || R(this.git2), this.gitInv3 = this.gitInv3 || R(this.git3), this.gitInv4 = this.gitInv4 || R(this.git4), this.gitInv5 = this.gitInv5 || R(this.git5), this.gitInv6 = this.gitInv6 || R(this.git6), this.gitInv7 = this.gitInv7 || R(this.git7), this.branchLabelColor = this.branchLabelColor || (this.darkMode ? `black` : this.labelTextColor), this.gitBranchLabel0 = this.gitBranchLabel0 || this.branchLabelColor, this.gitBranchLabel1 = this.gitBranchLabel1 || this.branchLabelColor, this.gitBranchLabel2 = this.gitBranchLabel2 || this.branchLabelColor, this.gitBranchLabel3 = this.gitBranchLabel3 || this.branchLabelColor, this.gitBranchLabel4 = this.gitBranchLabel4 || this.branchLabelColor, this.gitBranchLabel5 = this.gitBranchLabel5 || this.branchLabelColor, this.gitBranchLabel6 = this.gitBranchLabel6 || this.branchLabelColor, this.gitBranchLabel7 = this.gitBranchLabel7 || this.branchLabelColor, this.tagLabelColor = this.tagLabelColor || this.primaryTextColor, this.tagLabelBackground = this.tagLabelBackground || this.primaryColor, this.tagLabelBorder = this.tagBorder || this.primaryBorderColor, this.tagLabelFontSize = this.tagLabelFontSize || `10px`, this.commitLabelColor = this.commitLabelColor || this.secondaryTextColor, this.commitLabelBackground = this.commitLabelBackground || this.secondaryColor, this.commitLabelFontSize = this.commitLabelFontSize || `10px`, this.commitLineColor = this.commitLineColor ?? `#BDBCCC`, this.fontWeight = 600, this.erEdgeLabelBackground = `#16141F`, this.attributeBackgroundColorOdd = this.attributeBackgroundColorOdd || B, this.attributeBackgroundColorEven = this.attributeBackgroundColorEven || V;
        }
        calculate(e) {
            if (typeof e != `object`) {
                this.updateColors();
                return;
            }
            let t = Object.keys(e);
            t.forEach((t)=>{
                this[t] = e[t];
            }), this.updateColors(), t.forEach((t)=>{
                this[t] = e[t];
            });
        }
    };
    W = {
        base: {
            getThemeVariables: U
        },
        dark: {
            getThemeVariables: Ct
        },
        default: {
            getThemeVariables: Tt
        },
        forest: {
            getThemeVariables: Dt
        },
        neutral: {
            getThemeVariables: kt
        },
        neo: {
            getThemeVariables: jt
        },
        "neo-dark": {
            getThemeVariables: Nt
        },
        redux: {
            getThemeVariables: Ft
        },
        "redux-dark": {
            getThemeVariables: Lt
        },
        "redux-color": {
            getThemeVariables: zt
        },
        "redux-dark-color": {
            getThemeVariables: t((e)=>{
                let t = new Bt;
                return t.calculate(e), t;
            }, `getThemeVariables`)
        }
    };
    G = {
        flowchart: {
            useMaxWidth: !0,
            titleTopMargin: 25,
            subGraphTitleMargin: {
                top: 0,
                bottom: 0
            },
            diagramPadding: 8,
            htmlLabels: null,
            nodeSpacing: 50,
            rankSpacing: 50,
            curve: `basis`,
            padding: 15,
            defaultRenderer: `dagre-wrapper`,
            wrappingWidth: 200,
            inheritDir: !1
        },
        swimlane: {
            useMaxWidth: !0,
            lineHops: `arc`,
            ignoreCrossLaneEdges: !0,
            optimizeRanksByCrossings: !0,
            automaticLaneOrdering: !1
        },
        sequence: {
            useMaxWidth: !0,
            hideUnusedParticipants: !1,
            activationWidth: 10,
            diagramMarginX: 50,
            diagramMarginY: 10,
            actorMargin: 50,
            width: 150,
            height: 65,
            boxMargin: 10,
            boxTextMargin: 5,
            noteMargin: 10,
            messageMargin: 35,
            messageAlign: `center`,
            mirrorActors: !0,
            forceMenus: !1,
            bottomMarginAdj: 1,
            rightAngles: !1,
            showSequenceNumbers: !1,
            actorFontSize: 14,
            actorFontFamily: `"Open Sans", sans-serif`,
            actorFontWeight: 400,
            noteFontSize: 14,
            noteFontFamily: `"trebuchet ms", verdana, arial, sans-serif`,
            noteFontWeight: 400,
            noteAlign: `center`,
            messageFontSize: 16,
            messageFontFamily: `"trebuchet ms", verdana, arial, sans-serif`,
            messageFontWeight: 400,
            wrap: !1,
            wrapPadding: 10,
            labelBoxWidth: 50,
            labelBoxHeight: 20
        },
        gantt: {
            useMaxWidth: !0,
            titleTopMargin: 25,
            barHeight: 20,
            barGap: 4,
            topPadding: 50,
            rightPadding: 75,
            leftPadding: 75,
            gridLineStartPadding: 35,
            fontSize: 11,
            sectionFontSize: 11,
            numberSectionStyles: 4,
            axisFormat: `%Y-%m-%d`,
            topAxis: !1,
            displayMode: ``,
            weekday: `sunday`
        },
        journey: {
            useMaxWidth: !0,
            diagramMarginX: 50,
            diagramMarginY: 10,
            leftMargin: 150,
            maxLabelWidth: 360,
            width: 150,
            height: 50,
            boxMargin: 10,
            boxTextMargin: 5,
            noteMargin: 10,
            messageMargin: 35,
            messageAlign: `center`,
            bottomMarginAdj: 1,
            rightAngles: !1,
            taskFontSize: 14,
            taskFontFamily: `"Open Sans", sans-serif`,
            taskMargin: 50,
            activationWidth: 10,
            textPlacement: `fo`,
            actorColours: [
                `#8FBC8F`,
                `#7CFC00`,
                `#00FFFF`,
                `#20B2AA`,
                `#B0E0E6`,
                `#FFFFE0`
            ],
            sectionFills: [
                `#191970`,
                `#8B008B`,
                `#4B0082`,
                `#2F4F4F`,
                `#800000`,
                `#8B4513`,
                `#00008B`
            ],
            sectionColours: [
                `#fff`
            ],
            titleColor: ``,
            titleFontFamily: `"trebuchet ms", verdana, arial, sans-serif`,
            titleFontSize: `4ex`
        },
        class: {
            useMaxWidth: !0,
            titleTopMargin: 25,
            arrowMarkerAbsolute: !1,
            dividerMargin: 10,
            padding: 5,
            textHeight: 10,
            defaultRenderer: `dagre-wrapper`,
            htmlLabels: !1,
            hideEmptyMembersBox: !1,
            hierarchicalNamespaces: !0
        },
        state: {
            useMaxWidth: !0,
            titleTopMargin: 25,
            dividerMargin: 10,
            sizeUnit: 5,
            padding: 8,
            textHeight: 10,
            titleShift: -15,
            noteMargin: 10,
            forkWidth: 70,
            forkHeight: 7,
            miniPadding: 2,
            fontSizeFactor: 5.02,
            fontSize: 24,
            labelHeight: 16,
            edgeLengthFactor: `20`,
            compositTitleSize: 35,
            radius: 5,
            defaultRenderer: `dagre-wrapper`
        },
        er: {
            useMaxWidth: !0,
            titleTopMargin: 25,
            diagramPadding: 20,
            layoutDirection: `TB`,
            minEntityWidth: 100,
            minEntityHeight: 75,
            entityPadding: 15,
            nodeSpacing: 140,
            rankSpacing: 80,
            stroke: `gray`,
            fill: `honeydew`,
            fontSize: 12
        },
        pie: {
            useMaxWidth: !0,
            textPosition: .75,
            donutHole: 0,
            legendPosition: `right`,
            highlightSlice: ``
        },
        quadrantChart: {
            useMaxWidth: !0,
            chartWidth: 500,
            chartHeight: 500,
            titleFontSize: 20,
            titlePadding: 10,
            quadrantPadding: 5,
            xAxisLabelPadding: 5,
            yAxisLabelPadding: 5,
            xAxisLabelFontSize: 16,
            yAxisLabelFontSize: 16,
            quadrantLabelFontSize: 16,
            quadrantTextTopPadding: 5,
            pointTextPadding: 5,
            pointLabelFontSize: 12,
            pointRadius: 5,
            xAxisPosition: `top`,
            yAxisPosition: `left`,
            quadrantInternalBorderStrokeWidth: 1,
            quadrantExternalBorderStrokeWidth: 2
        },
        xyChart: {
            useMaxWidth: !0,
            width: 700,
            height: 500,
            titleFontSize: 20,
            titlePadding: 10,
            showDataLabel: !1,
            showDataLabelOutsideBar: !1,
            showTitle: !0,
            showLegend: !0,
            legendFontSize: 14,
            legendPadding: 10,
            xAxis: {
                $ref: `#/$defs/XYChartAxisConfig`,
                showLabel: !0,
                labelFontSize: 14,
                labelPadding: 5,
                showTitle: !0,
                titleFontSize: 16,
                titlePadding: 5,
                showTick: !0,
                tickLength: 5,
                tickWidth: 2,
                showAxisLine: !0,
                axisLineWidth: 2,
                labelRotation: 0
            },
            yAxis: {
                $ref: `#/$defs/XYChartAxisConfig`,
                showLabel: !0,
                labelFontSize: 14,
                labelPadding: 5,
                showTitle: !0,
                titleFontSize: 16,
                titlePadding: 5,
                showTick: !0,
                tickLength: 5,
                tickWidth: 2,
                showAxisLine: !0,
                axisLineWidth: 2,
                labelRotation: 0
            },
            chartOrientation: `vertical`,
            plotReservedSpacePercent: 50
        },
        requirement: {
            useMaxWidth: !0,
            rect_fill: `#f9f9f9`,
            text_color: `#333`,
            rect_border_size: `0.5px`,
            rect_border_color: `#bbb`,
            rect_min_width: 200,
            rect_min_height: 200,
            fontSize: 14,
            rect_padding: 10,
            line_height: 20
        },
        mindmap: {
            useMaxWidth: !0,
            padding: 10,
            maxNodeWidth: 200,
            layoutAlgorithm: `cose-bilkent`
        },
        ishikawa: {
            useMaxWidth: !0,
            diagramPadding: 20
        },
        kanban: {
            useMaxWidth: !0,
            padding: 8,
            sectionWidth: 200,
            ticketBaseUrl: ``
        },
        timeline: {
            useMaxWidth: !0,
            diagramMarginX: 50,
            diagramMarginY: 10,
            leftMargin: 150,
            width: 150,
            height: 50,
            boxMargin: 10,
            boxTextMargin: 5,
            noteMargin: 10,
            messageMargin: 35,
            messageAlign: `center`,
            bottomMarginAdj: 1,
            rightAngles: !1,
            taskFontSize: 14,
            taskFontFamily: `"Open Sans", sans-serif`,
            taskMargin: 50,
            activationWidth: 10,
            textPlacement: `fo`,
            actorColours: [
                `#8FBC8F`,
                `#7CFC00`,
                `#00FFFF`,
                `#20B2AA`,
                `#B0E0E6`,
                `#FFFFE0`
            ],
            sectionFills: [
                `#191970`,
                `#8B008B`,
                `#4B0082`,
                `#2F4F4F`,
                `#800000`,
                `#8B4513`,
                `#00008B`
            ],
            sectionColours: [
                `#fff`
            ],
            disableMulticolor: !1
        },
        gitGraph: {
            useMaxWidth: !0,
            titleTopMargin: 25,
            diagramPadding: 8,
            nodeLabel: {
                width: 75,
                height: 100,
                x: -25,
                y: 0
            },
            mainBranchName: `main`,
            mainBranchOrder: 0,
            showCommitLabel: !0,
            showBranches: !0,
            rotateCommitLabel: !0,
            parallelCommits: !1,
            arrowMarkerAbsolute: !1
        },
        c4: {
            useMaxWidth: !0,
            diagramMarginX: 50,
            diagramMarginY: 10,
            c4ShapeMargin: 50,
            c4ShapePadding: 20,
            width: 216,
            height: 60,
            boxMargin: 10,
            c4ShapeInRow: 4,
            nextLinePaddingX: 0,
            c4BoundaryInRow: 2,
            personFontSize: 14,
            personFontFamily: `"Open Sans", sans-serif`,
            personFontWeight: `normal`,
            external_personFontSize: 14,
            external_personFontFamily: `"Open Sans", sans-serif`,
            external_personFontWeight: `normal`,
            systemFontSize: 14,
            systemFontFamily: `"Open Sans", sans-serif`,
            systemFontWeight: `normal`,
            external_systemFontSize: 14,
            external_systemFontFamily: `"Open Sans", sans-serif`,
            external_systemFontWeight: `normal`,
            system_dbFontSize: 14,
            system_dbFontFamily: `"Open Sans", sans-serif`,
            system_dbFontWeight: `normal`,
            external_system_dbFontSize: 14,
            external_system_dbFontFamily: `"Open Sans", sans-serif`,
            external_system_dbFontWeight: `normal`,
            system_queueFontSize: 14,
            system_queueFontFamily: `"Open Sans", sans-serif`,
            system_queueFontWeight: `normal`,
            external_system_queueFontSize: 14,
            external_system_queueFontFamily: `"Open Sans", sans-serif`,
            external_system_queueFontWeight: `normal`,
            boundaryFontSize: 14,
            boundaryFontFamily: `"Open Sans", sans-serif`,
            boundaryFontWeight: `normal`,
            messageFontSize: 12,
            messageFontFamily: `"Open Sans", sans-serif`,
            messageFontWeight: `normal`,
            containerFontSize: 14,
            containerFontFamily: `"Open Sans", sans-serif`,
            containerFontWeight: `normal`,
            external_containerFontSize: 14,
            external_containerFontFamily: `"Open Sans", sans-serif`,
            external_containerFontWeight: `normal`,
            container_dbFontSize: 14,
            container_dbFontFamily: `"Open Sans", sans-serif`,
            container_dbFontWeight: `normal`,
            external_container_dbFontSize: 14,
            external_container_dbFontFamily: `"Open Sans", sans-serif`,
            external_container_dbFontWeight: `normal`,
            container_queueFontSize: 14,
            container_queueFontFamily: `"Open Sans", sans-serif`,
            container_queueFontWeight: `normal`,
            external_container_queueFontSize: 14,
            external_container_queueFontFamily: `"Open Sans", sans-serif`,
            external_container_queueFontWeight: `normal`,
            componentFontSize: 14,
            componentFontFamily: `"Open Sans", sans-serif`,
            componentFontWeight: `normal`,
            external_componentFontSize: 14,
            external_componentFontFamily: `"Open Sans", sans-serif`,
            external_componentFontWeight: `normal`,
            component_dbFontSize: 14,
            component_dbFontFamily: `"Open Sans", sans-serif`,
            component_dbFontWeight: `normal`,
            external_component_dbFontSize: 14,
            external_component_dbFontFamily: `"Open Sans", sans-serif`,
            external_component_dbFontWeight: `normal`,
            component_queueFontSize: 14,
            component_queueFontFamily: `"Open Sans", sans-serif`,
            component_queueFontWeight: `normal`,
            external_component_queueFontSize: 14,
            external_component_queueFontFamily: `"Open Sans", sans-serif`,
            external_component_queueFontWeight: `normal`,
            wrap: !0,
            wrapPadding: 10,
            person_bg_color: `#08427B`,
            person_border_color: `#073B6F`,
            external_person_bg_color: `#686868`,
            external_person_border_color: `#8A8A8A`,
            system_bg_color: `#1168BD`,
            system_border_color: `#3C7FC0`,
            system_db_bg_color: `#1168BD`,
            system_db_border_color: `#3C7FC0`,
            system_queue_bg_color: `#1168BD`,
            system_queue_border_color: `#3C7FC0`,
            external_system_bg_color: `#999999`,
            external_system_border_color: `#8A8A8A`,
            external_system_db_bg_color: `#999999`,
            external_system_db_border_color: `#8A8A8A`,
            external_system_queue_bg_color: `#999999`,
            external_system_queue_border_color: `#8A8A8A`,
            container_bg_color: `#438DD5`,
            container_border_color: `#3C7FC0`,
            container_db_bg_color: `#438DD5`,
            container_db_border_color: `#3C7FC0`,
            container_queue_bg_color: `#438DD5`,
            container_queue_border_color: `#3C7FC0`,
            external_container_bg_color: `#B3B3B3`,
            external_container_border_color: `#A6A6A6`,
            external_container_db_bg_color: `#B3B3B3`,
            external_container_db_border_color: `#A6A6A6`,
            external_container_queue_bg_color: `#B3B3B3`,
            external_container_queue_border_color: `#A6A6A6`,
            component_bg_color: `#85BBF0`,
            component_border_color: `#78A8D8`,
            component_db_bg_color: `#85BBF0`,
            component_db_border_color: `#78A8D8`,
            component_queue_bg_color: `#85BBF0`,
            component_queue_border_color: `#78A8D8`,
            external_component_bg_color: `#CCCCCC`,
            external_component_border_color: `#BFBFBF`,
            external_component_db_bg_color: `#CCCCCC`,
            external_component_db_border_color: `#BFBFBF`,
            external_component_queue_bg_color: `#CCCCCC`,
            external_component_queue_border_color: `#BFBFBF`
        },
        sankey: {
            useMaxWidth: !0,
            width: 600,
            height: 400,
            linkColor: `gradient`,
            nodeAlignment: `justify`,
            showValues: !0,
            prefix: ``,
            suffix: ``,
            nodeWidth: 10,
            nodePadding: 12,
            labelStyle: `legacy`
        },
        block: {
            useMaxWidth: !0,
            padding: 8
        },
        packet: {
            useMaxWidth: !0,
            rowHeight: 32,
            bitWidth: 32,
            bitsPerRow: 32,
            showBits: !0,
            paddingX: 5,
            paddingY: 5
        },
        treeView: {
            useMaxWidth: !0,
            rowIndent: 10,
            paddingX: 5,
            paddingY: 5,
            lineThickness: 1,
            showIcons: !1,
            defaultIconPack: ``,
            filenameIcons: {},
            extensionIcons: {}
        },
        architecture: {
            useMaxWidth: !0,
            padding: 40,
            iconSize: 80,
            fontSize: 16,
            randomize: !1,
            nodeSeparation: 75,
            idealEdgeLengthMultiplier: 1.5,
            edgeElasticity: .45,
            numIter: 2500,
            seed: 1
        },
        eventmodeling: {
            useMaxWidth: !0,
            padding: 30,
            rowHeight: 32
        },
        radar: {
            useMaxWidth: !0,
            width: 600,
            height: 600,
            marginTop: 50,
            marginRight: 50,
            marginBottom: 50,
            marginLeft: 50,
            axisScaleFactor: 1,
            axisLabelFactor: 1.05,
            curveTension: .17
        },
        venn: {
            useMaxWidth: !0,
            width: 800,
            height: 450,
            padding: 8,
            useDebugLayout: !1
        },
        cynefin: {
            useMaxWidth: !0,
            width: 800,
            height: 600,
            padding: 40,
            showDomainDescriptions: !0,
            boundaryAmplitude: 8,
            seed: 0
        },
        theme: `default`,
        look: `classic`,
        handDrawnSeed: 0,
        layout: `dagre`,
        maxTextSize: 5e4,
        maxEdges: 500,
        darkMode: !1,
        fontFamily: `"trebuchet ms", verdana, arial, sans-serif;`,
        logLevel: 5,
        securityLevel: `strict`,
        startOnLoad: !0,
        arrowMarkerAbsolute: !1,
        secure: [
            `secure`,
            `securityLevel`,
            `startOnLoad`,
            `maxTextSize`,
            `suppressErrorRendering`,
            `maxEdges`
        ],
        legacyMathML: !1,
        forceLegacyMathML: !1,
        deterministicIds: !1,
        fontSize: 16,
        markdownAutoWrap: !0,
        suppressErrorRendering: !1
    };
    Vt = {
        ...G,
        deterministicIDSeed: void 0,
        elk: {
            mergeEdges: !1,
            nodePlacementStrategy: `BRANDES_KOEPF`,
            nodePlacementAlignment: `NONE`,
            forceNodeModelOrder: !1,
            considerModelOrder: `NODES_AND_EDGES`,
            keepEntryNodeOnTop: !1
        },
        themeCSS: void 0,
        themeVariables: W.default.getThemeVariables(),
        sequence: {
            ...G.sequence,
            messageFont: t(function() {
                return {
                    fontFamily: this.messageFontFamily,
                    fontSize: this.messageFontSize,
                    fontWeight: this.messageFontWeight
                };
            }, `messageFont`),
            noteFont: t(function() {
                return {
                    fontFamily: this.noteFontFamily,
                    fontSize: this.noteFontSize,
                    fontWeight: this.noteFontWeight
                };
            }, `noteFont`),
            actorFont: t(function() {
                return {
                    fontFamily: this.actorFontFamily,
                    fontSize: this.actorFontSize,
                    fontWeight: this.actorFontWeight
                };
            }, `actorFont`)
        },
        class: {
            defaultRenderer: `dagre-wrapper`,
            hideEmptyMembersBox: !1,
            hierarchicalNamespaces: !0
        },
        gantt: {
            ...G.gantt,
            tickInterval: void 0,
            useWidth: void 0
        },
        c4: {
            ...G.c4,
            useWidth: void 0,
            personFont: t(function() {
                return {
                    fontFamily: this.personFontFamily,
                    fontSize: this.personFontSize,
                    fontWeight: this.personFontWeight
                };
            }, `personFont`),
            flowchart: {
                ...G.flowchart,
                inheritDir: !1
            },
            external_personFont: t(function() {
                return {
                    fontFamily: this.external_personFontFamily,
                    fontSize: this.external_personFontSize,
                    fontWeight: this.external_personFontWeight
                };
            }, `external_personFont`),
            systemFont: t(function() {
                return {
                    fontFamily: this.systemFontFamily,
                    fontSize: this.systemFontSize,
                    fontWeight: this.systemFontWeight
                };
            }, `systemFont`),
            external_systemFont: t(function() {
                return {
                    fontFamily: this.external_systemFontFamily,
                    fontSize: this.external_systemFontSize,
                    fontWeight: this.external_systemFontWeight
                };
            }, `external_systemFont`),
            system_dbFont: t(function() {
                return {
                    fontFamily: this.system_dbFontFamily,
                    fontSize: this.system_dbFontSize,
                    fontWeight: this.system_dbFontWeight
                };
            }, `system_dbFont`),
            external_system_dbFont: t(function() {
                return {
                    fontFamily: this.external_system_dbFontFamily,
                    fontSize: this.external_system_dbFontSize,
                    fontWeight: this.external_system_dbFontWeight
                };
            }, `external_system_dbFont`),
            system_queueFont: t(function() {
                return {
                    fontFamily: this.system_queueFontFamily,
                    fontSize: this.system_queueFontSize,
                    fontWeight: this.system_queueFontWeight
                };
            }, `system_queueFont`),
            external_system_queueFont: t(function() {
                return {
                    fontFamily: this.external_system_queueFontFamily,
                    fontSize: this.external_system_queueFontSize,
                    fontWeight: this.external_system_queueFontWeight
                };
            }, `external_system_queueFont`),
            containerFont: t(function() {
                return {
                    fontFamily: this.containerFontFamily,
                    fontSize: this.containerFontSize,
                    fontWeight: this.containerFontWeight
                };
            }, `containerFont`),
            external_containerFont: t(function() {
                return {
                    fontFamily: this.external_containerFontFamily,
                    fontSize: this.external_containerFontSize,
                    fontWeight: this.external_containerFontWeight
                };
            }, `external_containerFont`),
            container_dbFont: t(function() {
                return {
                    fontFamily: this.container_dbFontFamily,
                    fontSize: this.container_dbFontSize,
                    fontWeight: this.container_dbFontWeight
                };
            }, `container_dbFont`),
            external_container_dbFont: t(function() {
                return {
                    fontFamily: this.external_container_dbFontFamily,
                    fontSize: this.external_container_dbFontSize,
                    fontWeight: this.external_container_dbFontWeight
                };
            }, `external_container_dbFont`),
            container_queueFont: t(function() {
                return {
                    fontFamily: this.container_queueFontFamily,
                    fontSize: this.container_queueFontSize,
                    fontWeight: this.container_queueFontWeight
                };
            }, `container_queueFont`),
            external_container_queueFont: t(function() {
                return {
                    fontFamily: this.external_container_queueFontFamily,
                    fontSize: this.external_container_queueFontSize,
                    fontWeight: this.external_container_queueFontWeight
                };
            }, `external_container_queueFont`),
            componentFont: t(function() {
                return {
                    fontFamily: this.componentFontFamily,
                    fontSize: this.componentFontSize,
                    fontWeight: this.componentFontWeight
                };
            }, `componentFont`),
            external_componentFont: t(function() {
                return {
                    fontFamily: this.external_componentFontFamily,
                    fontSize: this.external_componentFontSize,
                    fontWeight: this.external_componentFontWeight
                };
            }, `external_componentFont`),
            component_dbFont: t(function() {
                return {
                    fontFamily: this.component_dbFontFamily,
                    fontSize: this.component_dbFontSize,
                    fontWeight: this.component_dbFontWeight
                };
            }, `component_dbFont`),
            external_component_dbFont: t(function() {
                return {
                    fontFamily: this.external_component_dbFontFamily,
                    fontSize: this.external_component_dbFontSize,
                    fontWeight: this.external_component_dbFontWeight
                };
            }, `external_component_dbFont`),
            component_queueFont: t(function() {
                return {
                    fontFamily: this.component_queueFontFamily,
                    fontSize: this.component_queueFontSize,
                    fontWeight: this.component_queueFontWeight
                };
            }, `component_queueFont`),
            external_component_queueFont: t(function() {
                return {
                    fontFamily: this.external_component_queueFontFamily,
                    fontSize: this.external_component_queueFontSize,
                    fontWeight: this.external_component_queueFontWeight
                };
            }, `external_component_queueFont`),
            boundaryFont: t(function() {
                return {
                    fontFamily: this.boundaryFontFamily,
                    fontSize: this.boundaryFontSize,
                    fontWeight: this.boundaryFontWeight
                };
            }, `boundaryFont`),
            messageFont: t(function() {
                return {
                    fontFamily: this.messageFontFamily,
                    fontSize: this.messageFontSize,
                    fontWeight: this.messageFontWeight
                };
            }, `messageFont`)
        },
        pie: {
            ...G.pie,
            useWidth: 984
        },
        xyChart: {
            ...G.xyChart,
            useWidth: void 0
        },
        requirement: {
            ...G.requirement,
            useWidth: void 0
        },
        packet: {
            ...G.packet
        },
        eventmodeling: {
            ...G.eventmodeling
        },
        treeView: {
            ...G.treeView,
            useWidth: void 0
        },
        radar: {
            ...G.radar
        },
        railroad: {
            ...G.railroad,
            fontSize: void 0,
            fontFamily: void 0,
            terminalFill: void 0,
            terminalStroke: void 0,
            terminalTextColor: void 0,
            nonTerminalFill: void 0,
            nonTerminalStroke: void 0,
            nonTerminalTextColor: void 0,
            lineColor: void 0,
            markerFill: void 0,
            commentFill: void 0,
            commentStroke: void 0,
            commentTextColor: void 0,
            specialFill: void 0,
            specialStroke: void 0,
            ruleNameColor: void 0
        },
        ishikawa: {
            ...G.ishikawa
        },
        sankey: {
            ...G.sankey,
            nodeColors: void 0
        },
        treemap: {
            useMaxWidth: !0,
            padding: 10,
            diagramPadding: 8,
            showValues: !0,
            nodeWidth: 100,
            nodeHeight: 40,
            borderWidth: 1,
            valueFontSize: 12,
            labelFontSize: 14,
            valueFormat: `,`
        },
        venn: {
            ...G.venn
        },
        cynefin: {
            ...G.cynefin
        }
    };
    Ht = t((e, t = ``)=>Object.keys(e).reduce((n, r)=>Array.isArray(e[r]) ? n : typeof e[r] == `object` && e[r] !== null ? [
                ...n,
                t + r,
                ...Ht(e[r], ``)
            ] : [
                ...n,
                t + r
            ], []), `keyify`);
    K = new Set(Ht(Vt, ``));
    Ut = Vt;
    Wt = {
        nodeColors: /^#[\da-f]{3,8}$|^rgb\([\d\s%,.]+\)$|^hsl\([\d\s%,.]+\)$|^[a-z]+$/i,
        filenameIcons: /^[\w-]+(?::[\w-]+)?$/,
        extensionIcons: /^[\w-]+(?::[\w-]+)?$/
    };
    Gt = t((e, t)=>{
        for (let n of Object.keys(e)){
            let r = e[n];
            (n.startsWith(`__`) || n.includes(`proto`) || n.includes(`constr`) || typeof r != `string` || !t.test(r)) && (i.debug(`sanitize deleting dictionary entry:`, n, r), delete e[n]);
        }
    }, `sanitizeDictionaryConfig`);
    Kt = t((e)=>{
        if (i.debug(`sanitizeDirective called with`, e), !(typeof e != `object` || !e)) {
            if (Array.isArray(e)) {
                e.forEach((e)=>Kt(e));
                return;
            }
            for (let t of Object.keys(e)){
                if (i.debug(`Checking key`, t), t.startsWith(`__`) || t.includes(`proto`) || t.includes(`constr`) || !K.has(t) || e[t] == null) {
                    i.debug(`sanitize deleting key: `, t), delete e[t];
                    continue;
                }
                if (typeof e[t] == `object`) {
                    let n = Wt[t];
                    n ? Gt(e[t], n) : (i.debug(`sanitizing object`, t), Kt(e[t]));
                    continue;
                }
                for (let n of [
                    `themeCSS`,
                    `fontFamily`,
                    `altFontFamily`
                ])t.includes(n) && (i.debug(`sanitizing css option`, t), e[t] = qt(e[t]));
            }
            if (e.themeVariables) for (let t of Object.keys(e.themeVariables)){
                let n = e.themeVariables[t];
                n?.match && !n.match(/^[\d "#%(),.;A-Za-z]+$/) && (e.themeVariables[t] = ``);
            }
            i.debug(`After sanitization`, e);
        }
    }, `sanitizeDirective`);
    qt = t((e)=>{
        let t = 0, n = 0;
        for (let r of e){
            if (t < n) return `{ /* ERROR: Unbalanced CSS */ }`;
            r === `{` ? t++ : r === `}` && n++;
        }
        return t === n ? e : `{ /* ERROR: Unbalanced CSS */ }`;
    }, `sanitizeCss`);
    Jt = Object.freeze(Ut);
    Yt = t((e)=>!(e === !1 || [
            `false`,
            `null`,
            `0`
        ].includes(String(e).trim().toLowerCase())), `evaluate`);
    q = z({}, Jt);
    J = [];
    Zt = z({}, Jt);
    Y = t((e, t)=>{
        let n = z({}, e), r = {};
        for (let e of t)an(e), r = z(r, e);
        if (n = z(n, r), r.theme && r.theme in W) {
            let e = z(z({}, Xt).themeVariables || {}, r.themeVariables);
            n.theme && n.theme in W && (n.themeVariables = W[n.theme].getThemeVariables(e));
        }
        return Zt = n, un(Zt), Zt;
    }, `updateCurrentConfig`);
    Qt = t((e)=>(q = z({}, Jt), q = z(q, e), e.theme && W[e.theme] && (q.themeVariables = W[e.theme].getThemeVariables(e.themeVariables)), Y(q, J), q), `setSiteConfig`);
    $t = t((e)=>{
        Xt = z({}, e);
    }, `saveConfigFromInitialize`);
    en = t((e)=>(q = z(q, e), Y(q, J), q), `updateSiteConfig`);
    tn = t(()=>z({}, q), `getSiteConfig`);
    nn = t((e)=>(Y(Zt, [
            e
        ]), rn()), `setConfig`);
    rn = t(()=>z({}, Zt), `getConfig`);
    an = t((e)=>{
        e && ([
            `secure`,
            ...q.secure ?? []
        ].forEach((t)=>{
            Object.hasOwn(e, t) && (i.debug(`Denied attempt to modify a secure key ${t}`, e[t]), delete e[t]);
        }), Object.keys(e).forEach((t)=>{
            t.startsWith(`__`) && delete e[t];
        }), Object.keys(e).forEach((t)=>{
            typeof e[t] == `string` && (e[t].includes(`<`) || e[t].includes(`>`) || e[t].includes(`url(data:`)) && delete e[t], typeof e[t] == `object` && an(e[t]);
        }));
    }, `sanitize`);
    on = t((e)=>{
        Kt(e), e.fontFamily && !e.themeVariables?.fontFamily && (e.themeVariables = {
            ...e.themeVariables,
            fontFamily: e.fontFamily
        }), J.push(e), Y(q, J);
    }, `addDirective`);
    sn = t((e = q)=>{
        J = [], Y(e, J);
    }, `reset`);
    cn = {
        LAZY_LOAD_DEPRECATED: `The configuration options lazyLoadedDiagrams and loadExternalDiagramsAtStartup are deprecated. Please use registerExternalDiagrams instead.`,
        FLOWCHART_HTML_LABELS_DEPRECATED: `flowchart.htmlLabels is deprecated. Please use global htmlLabels instead.`
    };
    X = {};
    ln = t((e)=>{
        X[e] || (i.warn(cn[e]), X[e] = !0);
    }, `issueWarning`);
    un = t((e)=>{
        e && (e.lazyLoadedDiagrams || e.loadExternalDiagramsAtStartup) && ln(`LAZY_LOAD_DEPRECATED`);
    }, `checkConfig`);
    dn = t(()=>{
        let e = {};
        Xt && (e = z(e, Xt));
        for (let t of J)e = z(e, t);
        return e;
    }, `getUserDefinedConfig`);
    fn = t((e)=>(e.flowchart?.htmlLabels != null && ln(`FLOWCHART_HTML_LABELS_DEPRECATED`), Yt(e.htmlLabels ?? e.flowchart?.htmlLabels ?? !0)), `getEffectiveHtmlLabels`);
    pn = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s;
    mn = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;
    hn = /\s*%%.*\n/gm;
    gn = class extends Error {
        static{
            t(this, `UnknownDiagramError`);
        }
        constructor(e){
            super(e), this.name = `UnknownDiagramError`;
        }
    };
    _n = {};
    vn = t(function(e, t) {
        e = e.replace(pn, ``).replace(mn, ``).replace(hn, `
`);
        for (let [n, { detector: r }] of Object.entries(_n))if (r(e, t)) return n;
        throw new gn(`No diagram type detected matching given configuration for text: ${e}`);
    }, `detectType`);
    yn = t((...e)=>{
        for (let { id: t, detector: n, loader: r } of e)bn(t, n, r);
    }, `registerLazyLoadedDiagrams`);
    bn = t((e, t, n)=>{
        _n[e] && i.warn(`Detector with key ${e} already exists. Overwriting.`), _n[e] = {
            detector: t,
            loader: n
        }, i.debug(`Detector with key ${e} added${n ? ` with loader` : ``}`);
    }, `addDetector`);
    xn = t((e)=>_n[e].loader, `getDiagramLoader`);
    Z = /<br\s*\/?>/gi;
    Q = t((e)=>e ? An(e).replace(/\\n/g, `#br#`).split(`#br#`) : [
            ``
        ], `getRows`);
    Sn = (()=>{
        let e = !1;
        return ()=>{
            e ||= (Cn(), !0);
        };
    })();
    function Cn() {
        let e = `data-temp-href-target`;
        ut.addHook(`beforeSanitizeAttributes`, (t)=>{
            t.tagName === `A` && t.hasAttribute(`target`) && t.setAttribute(e, t.getAttribute(`target`) ?? ``);
        }), ut.addHook(`afterSanitizeAttributes`, (t)=>{
            t.tagName === `A` && t.hasAttribute(e) && (t.setAttribute(`target`, t.getAttribute(e) ?? ``), t.removeAttribute(e), t.getAttribute(`target`) === `_blank` && t.setAttribute(`rel`, `noopener`));
        });
    }
    t(Cn, `setupDompurifyHooks`);
    let wn, Tn, En, Dn, On, kn, An, Mn, Nn, Fn, In, Ln, Rn, zn, Hn, Gn, Kn, Yn;
    wn = t((e)=>(Sn(), ut.sanitize(e)), `removeScript`);
    Tn = t((e, t)=>{
        if (fn(t)) {
            let n = t.securityLevel;
            n === `antiscript` || n === `strict` || n === `sandbox` ? e = wn(e) : n !== `loose` && (e = An(e), e = e.replace(/</g, `&lt;`).replace(/>/g, `&gt;`), e = e.replace(/=/g, `&equals;`), e = kn(e));
        }
        return e;
    }, `sanitizeMore`);
    $ = t((e, t)=>e && (e = t.dompurifyConfig ? ut.sanitize(Tn(e, t), t.dompurifyConfig).toString() : ut.sanitize(Tn(e, t), {
            FORBID_TAGS: [
                `style`
            ]
        }).toString(), e), `sanitizeText`);
    En = t((e, t)=>typeof e == `string` ? $(e, t) : e.flat().map((e)=>$(e, t)), `sanitizeTextOrArray`);
    Dn = t((e)=>Z.test(e), `hasBreaks`);
    On = t((e)=>e.split(Z), `splitBreaks`);
    kn = t((e)=>e.replace(/#br#/g, `<br/>`), `placeholderToBreak`);
    An = t((e)=>e.replace(Z, `#br#`), `breakToPlaceholder`);
    jn = t((e)=>{
        let t = ``;
        return e && (t = window.location.protocol + `//` + window.location.host + window.location.pathname + window.location.search, t = CSS.escape(t)), t;
    }, `getUrl`);
    Mn = t(function(...e) {
        let t = e.filter((e)=>!isNaN(e));
        return Math.max(...t);
    }, `getMax`);
    Nn = t(function(...e) {
        let t = e.filter((e)=>!isNaN(e));
        return Math.min(...t);
    }, `getMin`);
    Pn = t(function(e) {
        let t = e.split(/(,)/), n = [];
        for(let e = 0; e < t.length; e++){
            let r = t[e];
            if (r === `,` && e > 0 && e + 1 < t.length) {
                let i = t[e - 1], a = t[e + 1];
                In(i, a) && (r = i + `,` + a, e++, n.pop());
            }
            n.push(Ln(r));
        }
        return n.join(``);
    }, `parseGenericTypes`);
    Fn = t((e, t)=>Math.max(0, e.split(t).length - 1), `countOccurrence`);
    In = t((e, t)=>{
        let n = Fn(e, `~`), r = Fn(t, `~`);
        return n === 1 && r === 1;
    }, `shouldCombineSets`);
    Ln = t((e)=>{
        let t = Fn(e, `~`), n = !1;
        if (t <= 1) return e;
        t % 2 != 0 && e.startsWith(`~`) && (e = e.substring(1), n = !0);
        let r = [
            ...e
        ], i = r.indexOf(`~`), a = r.lastIndexOf(`~`);
        for(; i !== -1 && a !== -1 && i !== a;)r[i] = `<`, r[a] = `>`, i = r.indexOf(`~`), a = r.lastIndexOf(`~`);
        return n && r.unshift(`~`), r.join(``);
    }, `processSet`);
    Rn = t(()=>window.MathMLElement !== void 0, `isMathMLSupported`);
    zn = /\$\$(.*?)\$\$/g;
    Bn = t((e)=>(e.match(zn)?.length ?? 0) > 0, `hasKatex`);
    Vn = t(async (e, t)=>{
        let n = document.createElement(`div`);
        n.innerHTML = await Un(e, t), n.id = `katex-temp`, n.style.visibility = `hidden`, n.style.position = `absolute`, n.style.top = `0`, document.querySelector(`body`)?.insertAdjacentElement(`beforeend`, n);
        let r = {
            width: n.clientWidth,
            height: n.clientHeight
        };
        return n.remove(), r;
    }, `calculateMathMLDimensions`);
    Hn = t(async (e, t)=>{
        if (!Bn(e)) return e;
        if (!(Rn() || t.legacyMathML || t.forceLegacyMathML)) return e.replace(zn, `MathML is unsupported in this environment.`);
        {
            let { default: n } = await c(async ()=>{
                let { default: e } = await import(`./vendor-katex-1qM3YPdw.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                }).then((e)=>e.o);
                return {
                    default: e
                };
            }, __vite__mapDeps([0,1,2])), r = t.forceLegacyMathML || !Rn() && t.legacyMathML ? `htmlAndMathml` : `mathml`;
            return e.split(Z).map((e)=>Bn(e) ? `<div style="display: flex; align-items: center; justify-content: center; white-space: nowrap;">${e}</div>` : `<div>${e}</div>`).join(``).replace(zn, (e, t)=>n.renderToString(t, {
                    throwOnError: !0,
                    displayMode: !0,
                    output: r
                }).replace(/\n/g, ` `).replace(/<annotation.*<\/annotation>/g, ``));
        }
        return e.replace(zn, `Katex is not supported in @mermaid-js/tiny. Please use the full mermaid library.`);
    }, `renderKatexUnsanitized`);
    Un = t(async (e, t)=>$(await Hn(e, t), t), `renderKatexSanitized`);
    Wn = {
        getRows: Q,
        sanitizeText: $,
        sanitizeTextOrArray: En,
        hasBreaks: Dn,
        splitBreaks: On,
        lineBreakRegex: Z,
        removeScript: wn,
        getUrl: jn,
        evaluate: Yt,
        getMax: Mn,
        getMin: Nn
    };
    Gn = t(function(e, t) {
        for (let n of t)e.attr(n[0], n[1]);
    }, `d3Attrs`);
    Kn = t(function(e, t, n) {
        let r = new Map;
        return n ? (r.set(`width`, `100%`), r.set(`style`, `max-width: ${t}px;`)) : (r.set(`height`, e), r.set(`width`, t)), r;
    }, `calculateSvgSizeAttrs`);
    qn = t(function(e, t, n, r) {
        Gn(e, Kn(t, n, r));
    }, `configureSvgSize`);
    Jn = t(function(e, t, n, r) {
        let a = t.node().getBBox(), o = a.width, s = a.height;
        i.info(`SVG bounds: ${o}x${s}`, a);
        let c = 0, l = 0;
        i.info(`Graph bounds: ${c}x${l}`, e), c = o + n * 2, l = s + n * 2, i.info(`Calculated bounds: ${c}x${l}`), qn(t, l, c, r);
        let u = `${a.x - n} ${a.y - n} ${a.width + 2 * n} ${a.height + 2 * n}`;
        t.attr(`viewBox`, u);
    }, `setupGraphViewbox`);
    Yn = {};
    Xn = function(e) {
        return [
            ...e.cssRules
        ].map((e)=>e.cssText).join(`
`);
    };
    t(Xn, `cssStyleSheetToString`);
    let Zn, Qn;
    Zn = t((e, t, n, r)=>{
        let a = ``;
        return e in Yn && Yn[e] ? a = Yn[e]({
            ...n,
            svgId: r
        }) : i.warn(`No theme found for ${e}`), `& {
    font-family: ${n.fontFamily};
    font-size: ${n.fontSize};
    fill: ${n.textColor}
  }
  @keyframes edge-animation-frame {
    from {
      stroke-dashoffset: 0;
    }
  }
  @keyframes dash {
    to {
      stroke-dashoffset: 0;
    }
  }
  & .edge-animation-slow {
    stroke-dasharray: 9,5 !important;
    stroke-dashoffset: 900;
    animation: dash 50s linear infinite;
    stroke-linecap: round;
  }
  & .edge-animation-fast {
    stroke-dasharray: 9,5 !important;
    stroke-dashoffset: 900;
    animation: dash 20s linear infinite;
    stroke-linecap: round;
  }
  /* Classes common for multiple diagrams */

  & .error-icon {
    fill: ${n.errorBkgColor};
  }
  & .error-text {
    fill: ${n.errorTextColor};
    stroke: ${n.errorTextColor};
  }

  & .edge-thickness-normal {
    stroke-width: ${n.strokeWidth ?? 1}px;
  }
  & .edge-thickness-thick {
    stroke-width: 3.5px
  }
  & .edge-pattern-solid {
    stroke-dasharray: 0;
  }
  & .edge-thickness-invisible {
    stroke-width: 0;
    fill: none;
  }
  & .edge-pattern-dashed{
    stroke-dasharray: 3;
  }
  .edge-pattern-dotted {
    stroke-dasharray: 2;
  }

  & .marker {
    fill: ${n.lineColor};
    stroke: ${n.lineColor};
  }
  & .marker.cross {
    stroke: ${n.lineColor};
  }

  & svg {
    font-family: ${n.fontFamily};
    font-size: ${n.fontSize};
  }
   & p {
    margin: 0
   }

  ${a}
  .node .neo-node {
    stroke: ${n.nodeBorder};
  }

  [data-look="neo"].node rect, [data-look="neo"].cluster rect, [data-look="neo"].node polygon {
    stroke: ${n.useGradient ? `url(` + r + `-gradient)` : n.nodeBorder};
    filter: ${n.dropShadow ? n.dropShadow.replace(`url(#drop-shadow)`, `url(${r}-drop-shadow)`) : `none`};
  }
  [data-look="neo"].swimlane.cluster rect {
    filter: none;
  }


  [data-look="neo"].node path {
    stroke: ${n.useGradient ? `url(` + r + `-gradient)` : n.nodeBorder};
    stroke-width: ${n.strokeWidth ?? 1}px;
  }

  [data-look="neo"].node .outer-path {
    filter: ${n.dropShadow ? n.dropShadow.replace(`url(#drop-shadow)`, `url(${r}-drop-shadow)`) : `none`};
  }

  [data-look="neo"].node .neo-line path {
    stroke: ${n.nodeBorder};
    filter: none;
  }

  [data-look="neo"].node circle{
    stroke: ${n.useGradient ? `url(` + r + `-gradient)` : n.nodeBorder};
    filter: ${n.dropShadow ? n.dropShadow.replace(`url(#drop-shadow)`, `url(${r}-drop-shadow)`) : `none`};
  }

  [data-look="neo"].node circle .state-start{
    fill: #000000;
  }

  [data-look="neo"].icon-shape .icon {
    fill: ${n.useGradient ? `url(` + r + `-gradient)` : n.nodeBorder};
    filter: ${n.dropShadow ? n.dropShadow.replace(`url(#drop-shadow)`, `url(${r}-drop-shadow)`) : `none`};
  }

    [data-look="neo"].icon-shape .icon-neo path {
    stroke: ${n.useGradient ? `url(` + r + `-gradient)` : n.nodeBorder};
    filter: ${n.dropShadow ? n.dropShadow.replace(`url(#drop-shadow)`, `url(${r}-drop-shadow)`) : `none`};
  }

  ${t}
`;
    }, `getStyles`);
    Qn = t((e, t)=>{
        t !== void 0 && (Yn[e] = t);
    }, `addStylesForDiagram`);
    $n = Zn;
    er = {};
    n(er, {
        clear: ()=>ar,
        getAccDescription: ()=>lr,
        getAccTitle: ()=>sr,
        getDiagramTitle: ()=>dr,
        setAccDescription: ()=>cr,
        setAccTitle: ()=>or,
        setDiagramTitle: ()=>ur
    });
    let tr, nr, rr, ir, fr, pr, yr, br, Cr;
    tr = ``;
    nr = ``;
    rr = ``;
    ir = t((e)=>$(e, rn()), `sanitizeText`);
    ar = t(()=>{
        tr = ``, rr = ``, nr = ``;
    }, `clear`);
    or = t((e)=>{
        tr = ir(e).replace(/^\s+/g, ``);
    }, `setAccTitle`);
    sr = t(()=>tr, `getAccTitle`);
    cr = t((e)=>{
        rr = ir(e).replace(/\n\s+/g, `
`);
    }, `setAccDescription`);
    lr = t(()=>rr, `getAccDescription`);
    ur = t((e)=>{
        nr = ir(e);
    }, `setDiagramTitle`);
    dr = t(()=>nr, `getDiagramTitle`);
    fr = i;
    pr = r;
    mr = rn;
    hr = nn;
    gr = Jt;
    _r = t((e)=>$(e, mr()), `sanitizeText`);
    vr = Jn;
    yr = t(()=>er, `getCommonDb`);
    br = {};
    xr = t((e, t, n)=>{
        br[e] && fr.warn(`Diagram with id ${e} already registered. Overwriting.`), br[e] = t, n && bn(e, n), Qn(e, t.styles), t.injectUtils?.(fr, pr, mr, _r, vr, yr(), ()=>{});
    }, `registerDiagram`);
    Sr = t((e)=>{
        if (e in br) return br[e];
        throw new Cr(e);
    }, `getDiagram`);
    Cr = class extends Error {
        static{
            t(this, `DiagramNotFoundError`);
        }
        constructor(e){
            super(`Diagram ${e} not found.`);
        }
    };
})();
export { F as $, Bn as A, _r as B, xn as C, Tt as D, tn as E, Un as F, hr as G, cr as H, sn as I, Jn as J, ur as K, qt as L, Pn as M, xr as N, jn as O, yn as P, en as Q, Kt as R, Sr as S, fn as T, or as U, $t as V, nn as W, $n as X, vr as Y, W as Z, pn as _, ar as a, E as at, rn as b, qn as c, l as ct, gr as d, P as et, Ut as f, Yt as g, mn as h, Vn as i, A as it, Z as j, dn as k, Xn as l, _n as m, on as n, M as nt, er as o, ut as ot, vn as p, Qt as q, z as r, j as rt, Wn as s, c as st, gn as t, N as tt, Jt as u, lr as v, dr as w, mr as x, sr as y, $ as z, __tla };
