export const publicStyle = `
:root{color-scheme:light;--paper:#fcfbf8;--ink:#191a18;--muted:#5c605b;--line:#dcded7;--accent:#ab422b;--wide:1180px;--reading:710px}
*,*::before,*::after{box-sizing:border-box}
html{scroll-padding-top:1rem}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}button{font:inherit;color:inherit}
:focus-visible{outline:3px solid #196ab6;outline-offset:4px}
img,video{display:block;max-width:100%}
.wrap{width:min(calc(100% - 48px),var(--wide));margin-inline:auto}
.skip{position:absolute;z-index:3;transform:translateY(-160%);background:#fff;padding:10px}.skip:focus{transform:none}
.mast{border-bottom:1px solid var(--line)}
.mast-inner,.footer-inner,.section-head,.share-actions{display:flex;align-items:center;justify-content:space-between;gap:16px}
.mast-inner{min-height:70px}
.brand{display:inline-flex;align-items:center;gap:9px;text-decoration:none;font-weight:780;letter-spacing:-.075em;font-size:29px;line-height:1.1}
.brand-mark{display:inline-grid;grid-template-columns:repeat(2,6px);align-items:end;gap:2px;transform:skew(-14deg);height:19px;margin-right:2px}
.brand-mark i{height:13px;background:var(--accent)}.brand-mark i+i{height:19px}
.brand img{height:34px;width:auto;max-width:185px;object-fit:contain}
.mast nav a,.footer-inner a.link{font-size:14px;color:var(--muted);text-decoration:none}
.mast nav a:hover,.footer-inner a.link:hover{text-decoration:underline}
.lead{display:grid;grid-template-columns:minmax(0,.91fr) minmax(0,1.09fr);align-items:center;gap:clamp(28px,5vw,76px);padding-block:clamp(38px,6vw,80px)}
.eyebrow{font-size:12px;font-weight:700;line-height:1.4;letter-spacing:.11em;text-transform:uppercase;color:var(--accent);margin:0 0 17px}
.lead h1,.story-head h1,.empty h1,.no-image-title{font-weight:650;font-size:clamp(42px,5.4vw,77px);line-height:1.015;letter-spacing:-.065em;margin:0;text-wrap:balance;overflow-wrap:anywhere}
.lead h1 a,.card h3 a,.read{color:inherit;text-decoration:none}.lead h1 a:hover,.card h3 a:hover{text-decoration:underline;text-decoration-thickness:.055em;text-underline-offset:.09em}
.lead .excerpt,.story-head .excerpt{line-height:1.48;color:var(--muted);letter-spacing:-.022em}
.lead .excerpt{font-size:clamp(18px,1.65vw,23px);margin:20px 0}
.byline{font-size:14px;line-height:1.55;color:var(--muted);display:flex;gap:6px 12px;flex-wrap:wrap;align-items:center}.byline span{font-weight:600;color:var(--ink)}
.byline span+time:before{content:"";display:inline-block;height:3px;width:3px;border-radius:50%;background:var(--muted);margin:0 12px 3px 0}
.read{margin-top:27px;display:inline-flex;align-items:center;gap:9px;font-size:15px;font-weight:650}.read span{color:var(--accent)}.read:hover{text-decoration:underline}
.cover{margin:0;overflow:hidden;background:#e9e9e3;isolation:isolate}.cover img{width:100%;height:100%;object-fit:cover}
.lead .cover{aspect-ratio:1.28;border-radius:4px}.no-image{grid-template-columns:1fr;max-width:960px;margin-inline:0}
.stories{padding-bottom:65px}.section-head{border-top:1px solid var(--ink);padding:15px 0 22px}.section-head h2,.share h2,.related h2{font-size:clamp(22px,2.4vw,31px);letter-spacing:-.05em;margin:0;font-weight:655}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,max(27%,260px)),1fr));gap:38px 28px}
.card{min-width:0}.card .cover{aspect-ratio:1.55;margin-bottom:16px;border-radius:3px}.card .eyebrow{margin:1px 0 7px}.card h3{font-size:clamp(22px,2.25vw,30px);line-height:1.14;letter-spacing:-.045em;margin:0 0 10px;font-weight:640;overflow-wrap:anywhere}.card time{font-size:13px;color:var(--muted)}
.empty{padding:clamp(60px,14vh,180px) 0;min-height:60vh;max-width:740px}.empty p:last-child{font-size:19px;color:var(--muted)}
.footer{border-top:1px solid var(--line);margin-top:32px}.footer-inner{min-height:88px}.footer .brand{font-size:23px}
.reader{width:min(calc(100% - 48px),var(--reading));margin-inline:auto}
.story-head{padding-top:clamp(32px,5vw,67px);margin-bottom:28px}.story-head .eyebrow{margin-bottom:12px}.story-head h1{font-size:clamp(39px,5.35vw,72px)}.story-head .excerpt{margin:18px 0;font-size:clamp(19px,2.2vw,25px)}.story-head .byline{margin-top:19px}
.hero-photo{width:min(calc(100% - 48px),960px);margin:0 auto 32px}.hero-photo img{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:3px;background:#e9e9e3}
.body{font-size:clamp(18px,1.4vw,20px);line-height:1.73;letter-spacing:-.014em;overflow-wrap:anywhere}.body>*{margin-block:0 1.25em}
.body a{color:var(--accent);text-underline-offset:3px}.body h2,.body h3{line-height:1.2;letter-spacing:-.045em;margin-top:1.5em}.body h2{font-size:1.65em}.body h3{font-size:1.32em}
.body ol,.body ul{padding-inline-start:1.55em}.body blockquote{border-left:3px solid var(--accent);padding-left:1.15em;font-size:1.16em;line-height:1.5;font-weight:490}
.body figure{margin-inline:0}.body figure img,.body video,.embed{width:100%;border-radius:3px}.body figure img{height:auto;background:#e9e9e3}.body figure img.size-fallback{aspect-ratio:16/9;object-fit:contain}.body video,.embed{aspect-ratio:16/9;background:#151613;border:0}
figcaption{margin-top:8px;font-size:13px;line-height:1.5;letter-spacing:0;color:var(--muted)}
.ad{width:100%;max-width:100%;overflow-x:clip;margin:16px auto;text-align:center;min-height:var(--unit-height,90px);display:flow-root;contain:layout}
.ad .ad-label{font-size:10px;letter-spacing:.12em;line-height:14px;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.ad>iframe,.ad iframe{max-width:100%}.ad.preview{background:#f4eee5;border:1px dashed #b47a60;color:#693d2b;padding:12px;display:grid;align-content:center;gap:3px;font:14px/1.4 system-ui}.ad.preview small{color:#6e625a}
.share,.related,.placement-report{margin-top:32px;padding-top:20px;border-top:1px solid var(--line)}
.share h2{font-size:19px;margin-bottom:13px}.share-actions{justify-content:flex-start;flex-wrap:wrap;gap:8px}
.share-actions a,.share-actions button{appearance:none;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:1px solid #cdd0c8;color:var(--ink);border-radius:40px;padding:8px 16px;min-height:42px;text-decoration:none;font-size:14px;cursor:pointer}.share-actions a:hover,.share-actions button:hover{background:#eeeee8}.share-actions [hidden]{display:none}
.share [role=status]{font-size:13px;margin:8px 0 0;color:var(--muted)}.share [role=status]:empty{display:none}
.related{margin-top:48px}.related h2{margin:0 0 18px}.related .grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.placement-report{font-size:14px}.placement-report li{margin:7px 0}.placement-report ul{padding-left:22px}
@media(max-width:760px){.wrap,.reader{width:calc(100% - 36px)}.mast-inner{min-height:56px}.brand{font-size:25px}.lead{grid-template-columns:1fr;gap:22px;padding:32px 0}.lead .cover{aspect-ratio:1.5}.lead .excerpt{margin:13px 0}.read{margin-top:17px}.grid,.related .grid{grid-template-columns:1fr;gap:27px}.card+.card{border-top:1px solid var(--line);padding-top:22px}.section-head{padding-bottom:16px}.hero-photo{width:100%}.hero-photo img{border-radius:0}.story-head{margin-bottom:22px}.story-head .byline{margin-top:14px}.footer-inner{min-height:70px}.stories{padding-bottom:30px}}
`;
