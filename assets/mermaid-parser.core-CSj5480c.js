const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/info-A6RAGUB7-GppGFRih.js","assets/chunk-FOHPRMQF-Crrb2Aik.js","assets/packet-AYTQ26CC-CpSmv7j9.js","assets/pie-WAS4IAKB-BOvdOHuE.js","assets/treeView-Q6P3EWNA-DncPIp80.js","assets/architecture-7GRP2DOG-CupHVail.js","assets/gitGraph-4MIJSDKK-BA4B3sFT.js","assets/eventmodeling-NTZA5JFV-CUF6bgrz.js","assets/radar-RG4KPBEZ-DgGN5bY2.js","assets/railroad-74A4TZTK-DYWBZtZ4.js","assets/railroad-ebnf-LZEXJU2U-DBGnGojL.js","assets/railroad-abnf-HS5TGJTU-BXoHO-fs.js","assets/railroad-peg-WCYAUIDC-Bn712NzR.js","assets/treemap-WGGIJYW6-CPSTHhN7.js","assets/wardley-WFR3VGLG-DbVmJfYB.js","assets/cynefin-OW5HDTMX-UHbA18ZF.js"])))=>i.map(i=>d[i]);
import { ct as e, st as t, __tla as __tla_0 } from "./chunk-DU6HZSFF-8qWruqdJ.js";
import { C as n, S as r, _ as i, a, b as o, c as ee, d as te, f as ne, g as re, h as ie, i as s, l as ae, m as oe, n as c, o as l, p as se, r as ce, s as le, t as u, u as d, v as ue, w as f, x as p, y as de } from "./chunk-FOHPRMQF-Crrb2Aik.js";
let _, O, w, D, h, T, j, E, Ce, Y, N, q, V, H, L, I, ze, m, g, W, z, Ve, X, R, Z, K, $, G, P, k, A, M;
let __tla = Promise.all([
    (()=>{
        try {
            return __tla_0;
        } catch  {}
    })()
]).then(async ()=>{
    let fe, pe;
    fe = class extends u {
        static{
            p(this, `ArchitectureTokenBuilder`);
        }
        constructor(){
            super([
                `architecture`
            ]);
        }
    };
    pe = class extends c {
        static{
            p(this, `ArchitectureValueConverter`);
        }
        runCustomConverter(e, t, n) {
            if (e.name === `ARCH_ICON`) return t.replace(/[()]/g, ``).trim();
            if (e.name === `ARCH_TEXT_ICON`) return t.replace(/["()]/g, ``);
            if (e.name === `ARCH_TITLE`) {
                let e = t.replace(/^\[|]$/g, ``).trim();
                return (e.startsWith(`"`) && e.endsWith(`"`) || e.startsWith(`'`) && e.endsWith(`'`)) && (e = e.slice(1, -1), e = e.replace(/\\"/g, `"`).replace(/\\'/g, `'`)), e.trim();
            }
        }
    };
    m = {
        parser: {
            TokenBuilder: p(()=>new fe, `TokenBuilder`),
            ValueConverter: p(()=>new pe, `ValueConverter`)
        }
    };
    h = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), ce, m);
        return t.ServiceRegistry.register(i), {
            shared: t,
            Architecture: i
        };
    };
    p(h, `createArchitectureServices`);
    let me;
    me = class extends u {
        static{
            p(this, `CynefinTokenBuilder`);
        }
        constructor(){
            super([
                `cynefin-beta`
            ]);
        }
    };
    g = {
        parser: {
            TokenBuilder: p(()=>new me, `TokenBuilder`),
            ValueConverter: p(()=>new s, `ValueConverter`)
        }
    };
    _ = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), a, g);
        return t.ServiceRegistry.register(i), {
            shared: t,
            Cynefin: i
        };
    };
    p(_, `createCynefinServices`);
    var he = class extends u {
        static{
            p(this, `EventModelingTokenBuilder`);
        }
        constructor(){
            super([
                `eventmodeling`
            ]);
        }
    }, v = new Set([
        `cmd`,
        `command`
    ]), y = new Set([
        `evt`,
        `event`
    ]), b = new Set([
        `rmo`,
        `readmodel`
    ]), x = new Set([
        `pcr`,
        `processor`
    ]), S = new Set([
        `ui`
    ]);
    function C(e) {
        let t = e.validation.EventModelingValidator, n = e.validation.ValidationRegistry;
        if (n) {
            let e = {
                EmTimeFrame: t.checkSourceFrameTypes.bind(t),
                EmResetFrame: t.checkSourceFrameTypes.bind(t)
            };
            n.register(e, t);
        }
    }
    p(C, `registerValidationChecks`);
    let ge;
    ge = class {
        static{
            p(this, `EventModelingValidator`);
        }
        checkSourceFrameTypes(e, t) {
            e.sourceFrames.length !== 0 && (v.has(e.modelEntityType) ? this.validateSources(e, new Set([
                ...S,
                ...x
            ]), `command`, `ui or processor`, t) : y.has(e.modelEntityType) ? this.validateSources(e, v, `event`, `command`, t) : b.has(e.modelEntityType) ? this.validateSources(e, y, `read model`, `event`, t) : x.has(e.modelEntityType) ? this.validateSources(e, b, `processor`, `read model`, t) : S.has(e.modelEntityType) && this.validateSources(e, b, `ui`, `read model`, t));
        }
        validateSources(e, t, n, r, i) {
            for (let a of e.sourceFrames){
                let o = a.ref;
                o !== void 0 && !t.has(o.modelEntityType) && i(`error`, `A ${n} can only receive input from a ${r}, not from '${o.modelEntityType}'.`, {
                    node: e,
                    property: `sourceFrames`
                });
            }
        }
    };
    w = {
        parser: {
            TokenBuilder: p(()=>new he, `TokenBuilder`),
            ValueConverter: p(()=>new s, `ValueConverter`)
        },
        validation: {
            EventModelingValidator: p(()=>new ge, `EventModelingValidator`)
        }
    };
    T = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), le, w);
        return t.ServiceRegistry.register(i), C(i), {
            shared: t,
            EventModel: i
        };
    };
    p(T, `createEventModelingServices`);
    let _e;
    _e = class extends u {
        static{
            p(this, `GitGraphTokenBuilder`);
        }
        constructor(){
            super([
                `gitGraph`
            ]);
        }
    };
    E = {
        parser: {
            TokenBuilder: p(()=>new _e, `TokenBuilder`),
            ValueConverter: p(()=>new s, `ValueConverter`)
        }
    };
    D = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), ee, E);
        return t.ServiceRegistry.register(i), {
            shared: t,
            GitGraph: i
        };
    };
    p(D, `createGitGraphServices`);
    let ve;
    ve = class extends u {
        static{
            p(this, `InfoTokenBuilder`);
        }
        constructor(){
            super([
                `info`,
                `showInfo`
            ]);
        }
    };
    O = {
        parser: {
            TokenBuilder: p(()=>new ve, `TokenBuilder`),
            ValueConverter: p(()=>new s, `ValueConverter`)
        }
    };
    k = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), ae, O);
        return t.ServiceRegistry.register(i), {
            shared: t,
            Info: i
        };
    };
    p(k, `createInfoServices`);
    let ye;
    ye = class extends u {
        static{
            p(this, `PacketTokenBuilder`);
        }
        constructor(){
            super([
                `packet`
            ]);
        }
    };
    A = {
        parser: {
            TokenBuilder: p(()=>new ye, `TokenBuilder`),
            ValueConverter: p(()=>new s, `ValueConverter`)
        }
    };
    j = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), te, A);
        return t.ServiceRegistry.register(i), {
            shared: t,
            Packet: i
        };
    };
    p(j, `createPacketServices`);
    let be, xe;
    be = class extends u {
        static{
            p(this, `PieTokenBuilder`);
        }
        constructor(){
            super([
                `pie`,
                `showData`
            ]);
        }
    };
    xe = class extends c {
        static{
            p(this, `PieValueConverter`);
        }
        runCustomConverter(e, t, n) {
            if (e.name === `PIE_SECTION_LABEL`) return t.replace(/"/g, ``).trim();
        }
    };
    M = {
        parser: {
            TokenBuilder: p(()=>new be, `TokenBuilder`),
            ValueConverter: p(()=>new xe, `ValueConverter`)
        }
    };
    N = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), ne, M);
        return t.ServiceRegistry.register(i), {
            shared: t,
            Pie: i
        };
    };
    p(N, `createPieServices`);
    let Se;
    Se = class extends u {
        static{
            p(this, `RadarTokenBuilder`);
        }
        constructor(){
            super([
                `radar-beta`
            ]);
        }
    };
    Ce = {
        parser: {
            TokenBuilder: p(()=>new Se, `TokenBuilder`),
            ValueConverter: p(()=>new s, `ValueConverter`)
        }
    };
    P = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), se, Ce);
        return t.ServiceRegistry.register(i), {
            shared: t,
            Radar: i
        };
    };
    p(P, `createRadarServices`);
    let we, F, Te;
    we = class extends u {
        static{
            p(this, `RailroadTokenBuilder`);
        }
        constructor(){
            super([
                `railroad-beta`
            ]);
        }
    };
    F = p((e)=>{
        let t = e.slice(1, -1), n = ``;
        for(let e = 0; e < t.length; e++){
            let r = t[e];
            if (r === `\\` && e + 1 < t.length) {
                e++;
                let r = t[e];
                switch(r){
                    case `n`:
                        n += `
`;
                        break;
                    case `r`:
                        n += `\r`;
                        break;
                    case `t`:
                        n += `	`;
                        break;
                    default:
                        n += r;
                }
                continue;
            }
            n += r;
        }
        return n;
    }, `decodeEscapedString`);
    Te = class extends c {
        static{
            p(this, `RailroadValueConverter`);
        }
        runConverter(e, t, n) {
            let r = super.runConverter(e, t, n);
            if (e.name === `TITLE` && typeof r == `string`) {
                let e = r.trim();
                if (e.startsWith(`"`) && e.endsWith(`"`) || e.startsWith(`'`) && e.endsWith(`'`)) return F(e);
            }
            return r;
        }
        runCustomConverter(e, t, n) {
            if (e.name === `RR_STRING`) return F(t);
        }
    };
    I = {
        parser: {
            TokenBuilder: p(()=>new we, `TokenBuilder`),
            ValueConverter: p(()=>new Te, `ValueConverter`)
        }
    };
    L = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), re, I);
        return t.ServiceRegistry.register(i), {
            shared: t,
            Railroad: i
        };
    };
    p(L, `createRailroadServices`);
    let Ee, De;
    Ee = class extends u {
        static{
            p(this, `RailroadAbnfTokenBuilder`);
        }
        constructor(){
            super([
                `railroad-abnf-beta`
            ]);
        }
    };
    De = class extends c {
        static{
            p(this, `RailroadAbnfValueConverter`);
        }
        runConverter(e, t, n) {
            let r = super.runConverter(e, t, n);
            if (e.name === `TITLE` && typeof r == `string`) {
                let e = r.trim();
                if (e.startsWith(`"`) && e.endsWith(`"`) || e.startsWith(`'`) && e.endsWith(`'`)) return e.slice(1, -1);
            }
            return r;
        }
        runCustomConverter(e, t, n) {
            if (e.name === `ABNF_STRING`) return t.slice(1, -1);
        }
    };
    R = {
        parser: {
            TokenBuilder: p(()=>new Ee, `TokenBuilder`),
            ValueConverter: p(()=>new De, `ValueConverter`)
        }
    };
    z = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), oe, R);
        return t.ServiceRegistry.register(i), {
            shared: t,
            RailroadAbnf: i
        };
    };
    p(z, `createRailroadAbnfServices`);
    let Oe, B, ke;
    Oe = class extends u {
        static{
            p(this, `RailroadEbnfTokenBuilder`);
        }
        constructor(){
            super([
                `railroad-ebnf-beta`
            ]);
        }
    };
    B = p((e)=>{
        let t = e.slice(1, -1), n = ``;
        for(let e = 0; e < t.length; e++){
            let r = t[e];
            if (r === `\\` && e + 1 < t.length) {
                e++;
                let r = t[e];
                switch(r){
                    case `n`:
                        n += `
`;
                        break;
                    case `r`:
                        n += `\r`;
                        break;
                    case `t`:
                        n += `	`;
                        break;
                    default:
                        n += r;
                }
                continue;
            }
            n += r;
        }
        return n;
    }, `decodeEscapedString`);
    ke = class extends c {
        static{
            p(this, `RailroadEbnfValueConverter`);
        }
        runConverter(e, t, n) {
            let r = super.runConverter(e, t, n);
            if (e.name === `TITLE` && typeof r == `string`) {
                let e = r.trim();
                if (e.startsWith(`"`) && e.endsWith(`"`) || e.startsWith(`'`) && e.endsWith(`'`)) return B(e);
            }
            return r;
        }
        runCustomConverter(e, t, n) {
            if (e.name === `EBNF_STRING`) return B(t);
            if (e.name === `EBNF_SPECIAL_SEQUENCE`) return t.slice(1, -1).trim();
        }
    };
    V = {
        parser: {
            TokenBuilder: p(()=>new Oe, `TokenBuilder`),
            ValueConverter: p(()=>new ke, `ValueConverter`)
        }
    };
    H = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), ie, V);
        return t.ServiceRegistry.register(i), {
            shared: t,
            RailroadEbnf: i
        };
    };
    p(H, `createRailroadEbnfServices`);
    let Ae, U, je;
    Ae = class extends u {
        static{
            p(this, `RailroadPegTokenBuilder`);
        }
        constructor(){
            super([
                `railroad-peg-beta`
            ]);
        }
    };
    U = p((e)=>{
        let t = e.slice(1, -1), n = ``;
        for(let e = 0; e < t.length; e++){
            let r = t[e];
            if (r === `\\` && e + 1 < t.length) {
                e++;
                let r = t[e];
                switch(r){
                    case `n`:
                        n += `
`;
                        break;
                    case `r`:
                        n += `\r`;
                        break;
                    case `t`:
                        n += `	`;
                        break;
                    default:
                        n += r;
                }
                continue;
            }
            n += r;
        }
        return n;
    }, `decodeEscapedString`);
    je = class extends c {
        static{
            p(this, `RailroadPegValueConverter`);
        }
        runConverter(e, t, n) {
            let r = super.runConverter(e, t, n);
            if (e.name === `TITLE` && typeof r == `string`) {
                let e = r.trim();
                if (e.startsWith(`"`) && e.endsWith(`"`) || e.startsWith(`'`) && e.endsWith(`'`)) return U(e);
            }
            return r;
        }
        runCustomConverter(e, t, n) {
            if (e.name === `PEG_STRING`) return U(t);
        }
    };
    W = {
        parser: {
            TokenBuilder: p(()=>new Ae, `TokenBuilder`),
            ValueConverter: p(()=>new je, `ValueConverter`)
        }
    };
    G = function(e = l) {
        let t = f(n(e), d), a = f(r({
            shared: t
        }), i, W);
        return t.ServiceRegistry.register(a), {
            shared: t,
            RailroadPeg: a
        };
    };
    p(G, `createRailroadPegServices`);
    let Me, Ne;
    Me = class extends c {
        static{
            p(this, `TreeViewValueConverter`);
        }
        runCustomConverter(e, t, n) {
            if (e.name === `INDENTATION`) return t?.length || 0;
            if (e.name === `QUOTED_NAME`) return t.substring(1, t.length - 1);
            if (e.name === `BARE_NAME`) return t.replace(/[\t ]+$/, ``);
            if (e.name === `CLASS_ANNOTATION`) return t.trim().substring(3).trim();
            if (e.name === `ICON_ANNOTATION`) {
                let e = t.trim();
                return e.substring(5, e.length - 1);
            }
            if (e.name === `DESC_ANNOTATION`) return t.trim().substring(2).trim();
        }
    };
    Ne = class extends u {
        static{
            p(this, `TreeViewTokenBuilder`);
        }
        constructor(){
            super([
                `treeView-beta`
            ]);
        }
    };
    K = {
        parser: {
            TokenBuilder: p(()=>new Ne, `TokenBuilder`),
            ValueConverter: p(()=>new Me, `ValueConverter`)
        }
    };
    q = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), ue, K);
        return t.ServiceRegistry.register(i), {
            shared: t,
            TreeView: i
        };
    };
    p(q, `createTreeViewServices`);
    var Pe = class extends u {
        static{
            p(this, `TreemapTokenBuilder`);
        }
        constructor(){
            super([
                `treemap`
            ]);
        }
    }, Fe = /classDef\s+([A-Z_a-z]\w+)(?:\s+([^\n\r;]*))?;?/, Ie = class extends c {
        static{
            p(this, `TreemapValueConverter`);
        }
        runCustomConverter(e, t, n) {
            if (e.name === `NUMBER2`) return parseFloat(t.replace(/,/g, ``));
            if (e.name === `SEPARATOR` || e.name === `STRING2`) return t.substring(1, t.length - 1);
            if (e.name === `INDENTATION`) return t.length;
            if (e.name === `ClassDef`) {
                if (typeof t != `string`) return t;
                let e = Fe.exec(t);
                if (e) return {
                    $type: `ClassDefStatement`,
                    className: e[1],
                    styleText: e[2] || void 0
                };
            }
        }
    };
    function J(e) {
        let t = e.validation.TreemapValidator, n = e.validation.ValidationRegistry;
        if (n) {
            let e = {
                Treemap: t.checkSingleRoot.bind(t)
            };
            n.register(e, t);
        }
    }
    p(J, `registerValidationChecks`);
    let Le;
    Le = class {
        static{
            p(this, `TreemapValidator`);
        }
        checkSingleRoot(e, t) {
            let n;
            for (let r of e.TreemapRows)r.item && (n === void 0 && r.indent === void 0 ? n = 0 : (r.indent === void 0 || n !== void 0 && n >= parseInt(r.indent, 10)) && t(`error`, `Multiple root nodes are not allowed in a treemap.`, {
                node: r,
                property: `item`
            }));
        }
    };
    Y = {
        parser: {
            TokenBuilder: p(()=>new Pe, `TokenBuilder`),
            ValueConverter: p(()=>new Ie, `ValueConverter`)
        },
        validation: {
            TreemapValidator: p(()=>new Le, `TreemapValidator`)
        }
    };
    X = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), de, Y);
        return t.ServiceRegistry.register(i), J(i), {
            shared: t,
            Treemap: i
        };
    };
    p(X, `createTreemapServices`);
    let Re;
    Re = class extends c {
        static{
            p(this, `WardleyValueConverter`);
        }
        runCustomConverter(e, t, n) {
            switch(e.name.toUpperCase()){
                case `LINK_LABEL`:
                    return t.substring(1).trim();
                default:
                    return;
            }
        }
    };
    Z = {
        parser: {
            ValueConverter: p(()=>new Re, `ValueConverter`)
        }
    };
    ze = function(e = l) {
        let t = f(n(e), d), i = f(r({
            shared: t
        }), o, Z);
        return t.ServiceRegistry.register(i), {
            shared: t,
            Wardley: i
        };
    };
    p(ze, `createWardleyServices`), e();
    var Q = {}, Be = {
        info: p(async ()=>{
            let { createInfoServices: e } = await t(async ()=>{
                let { createInfoServices: e } = await import(`./info-A6RAGUB7-GppGFRih.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createInfoServices: e
                };
            }, __vite__mapDeps([0,1]));
            Q.info = e().Info.parser.LangiumParser;
        }, `info`),
        packet: p(async ()=>{
            let { createPacketServices: e } = await t(async ()=>{
                let { createPacketServices: e } = await import(`./packet-AYTQ26CC-CpSmv7j9.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createPacketServices: e
                };
            }, __vite__mapDeps([2,1]));
            Q.packet = e().Packet.parser.LangiumParser;
        }, `packet`),
        pie: p(async ()=>{
            let { createPieServices: e } = await t(async ()=>{
                let { createPieServices: e } = await import(`./pie-WAS4IAKB-BOvdOHuE.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createPieServices: e
                };
            }, __vite__mapDeps([3,1]));
            Q.pie = e().Pie.parser.LangiumParser;
        }, `pie`),
        treeView: p(async ()=>{
            let { createTreeViewServices: e } = await t(async ()=>{
                let { createTreeViewServices: e } = await import(`./treeView-Q6P3EWNA-DncPIp80.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createTreeViewServices: e
                };
            }, __vite__mapDeps([4,1]));
            Q.treeView = e().TreeView.parser.LangiumParser;
        }, `treeView`),
        architecture: p(async ()=>{
            let { createArchitectureServices: e } = await t(async ()=>{
                let { createArchitectureServices: e } = await import(`./architecture-7GRP2DOG-CupHVail.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createArchitectureServices: e
                };
            }, __vite__mapDeps([5,1]));
            Q.architecture = e().Architecture.parser.LangiumParser;
        }, `architecture`),
        gitGraph: p(async ()=>{
            let { createGitGraphServices: e } = await t(async ()=>{
                let { createGitGraphServices: e } = await import(`./gitGraph-4MIJSDKK-BA4B3sFT.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createGitGraphServices: e
                };
            }, __vite__mapDeps([6,1]));
            Q.gitGraph = e().GitGraph.parser.LangiumParser;
        }, `gitGraph`),
        eventmodeling: p(async ()=>{
            let { createEventModelingServices: e } = await t(async ()=>{
                let { createEventModelingServices: e } = await import(`./eventmodeling-NTZA5JFV-CUF6bgrz.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createEventModelingServices: e
                };
            }, __vite__mapDeps([7,1]));
            Q.eventmodeling = e().EventModel.parser.LangiumParser;
        }, `eventmodeling`),
        radar: p(async ()=>{
            let { createRadarServices: e } = await t(async ()=>{
                let { createRadarServices: e } = await import(`./radar-RG4KPBEZ-DgGN5bY2.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createRadarServices: e
                };
            }, __vite__mapDeps([8,1]));
            Q.radar = e().Radar.parser.LangiumParser;
        }, `radar`),
        railroad: p(async ()=>{
            let { createRailroadServices: e } = await t(async ()=>{
                let { createRailroadServices: e } = await import(`./railroad-74A4TZTK-DYWBZtZ4.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createRailroadServices: e
                };
            }, __vite__mapDeps([9,1]));
            Q.railroad = e().Railroad.parser.LangiumParser;
        }, `railroad`),
        railroadEbnf: p(async ()=>{
            let { createRailroadEbnfServices: e } = await t(async ()=>{
                let { createRailroadEbnfServices: e } = await import(`./railroad-ebnf-LZEXJU2U-DBGnGojL.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createRailroadEbnfServices: e
                };
            }, __vite__mapDeps([10,1]));
            Q.railroadEbnf = e().RailroadEbnf.parser.LangiumParser;
        }, `railroadEbnf`),
        railroadAbnf: p(async ()=>{
            let { createRailroadAbnfServices: e } = await t(async ()=>{
                let { createRailroadAbnfServices: e } = await import(`./railroad-abnf-HS5TGJTU-BXoHO-fs.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createRailroadAbnfServices: e
                };
            }, __vite__mapDeps([11,1]));
            Q.railroadAbnf = e().RailroadAbnf.parser.LangiumParser;
        }, `railroadAbnf`),
        railroadPeg: p(async ()=>{
            let { createRailroadPegServices: e } = await t(async ()=>{
                let { createRailroadPegServices: e } = await import(`./railroad-peg-WCYAUIDC-Bn712NzR.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createRailroadPegServices: e
                };
            }, __vite__mapDeps([12,1]));
            Q.railroadPeg = e().RailroadPeg.parser.LangiumParser;
        }, `railroadPeg`),
        treemap: p(async ()=>{
            let { createTreemapServices: e } = await t(async ()=>{
                let { createTreemapServices: e } = await import(`./treemap-WGGIJYW6-CPSTHhN7.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createTreemapServices: e
                };
            }, __vite__mapDeps([13,1]));
            Q.treemap = e().Treemap.parser.LangiumParser;
        }, `treemap`),
        wardley: p(async ()=>{
            let { createWardleyServices: e } = await t(async ()=>{
                let { createWardleyServices: e } = await import(`./wardley-WFR3VGLG-DbVmJfYB.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createWardleyServices: e
                };
            }, __vite__mapDeps([14,1]));
            Q.wardley = e().Wardley.parser.LangiumParser;
        }, `wardley`),
        cynefin: p(async ()=>{
            let { createCynefinServices: e } = await t(async ()=>{
                let { createCynefinServices: e } = await import(`./cynefin-OW5HDTMX-UHbA18ZF.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    createCynefinServices: e
                };
            }, __vite__mapDeps([15,1]));
            Q.cynefin = e().Cynefin.parser.LangiumParser;
        }, `cynefin`)
    };
    Ve = async function(e, t) {
        let n = Be[e];
        if (!n) throw Error(`Unknown diagram type: ${e}`);
        Q[e] || await n();
        let r = Q[e].parse(t);
        if (r.lexerErrors.length > 0 || r.parserErrors.length > 0) throw new $(r);
        return r.value;
    };
    p(Ve, `parse`);
    $ = class extends Error {
        constructor(e){
            let t = e.lexerErrors.map((e)=>`Lexer error on line ${e.line !== void 0 && !isNaN(e.line) ? e.line : `?`}, column ${e.column !== void 0 && !isNaN(e.column) ? e.column : `?`}: ${e.message}`).join(`
`), n = e.parserErrors.map((e)=>`Parse error on line ${e.token.startLine !== void 0 && !isNaN(e.token.startLine) ? e.token.startLine : `?`}, column ${e.token.startColumn !== void 0 && !isNaN(e.token.startColumn) ? e.token.startColumn : `?`}: ${e.message}`).join(`
`);
            super(`Parsing failed: ${t} ${n}`), this.result = e;
        }
        static{
            p(this, `MermaidParseError`);
        }
    };
});
export { _ as A, O as C, w as D, D as E, h as M, T as O, j as S, E as T, Ce as _, Y as a, N as b, q as c, V as d, H as f, L as g, I as h, ze as i, m as j, g as k, W as l, z as m, Ve as n, X as o, R as p, Z as r, K as s, $ as t, G as u, P as v, k as w, A as x, M as y, __tla };
