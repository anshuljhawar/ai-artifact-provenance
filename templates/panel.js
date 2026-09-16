/* ai-artifact-provenance inline panel renderer. Paste inside <script data-ai-artifact-provenance-panel>...</script> before </body>. No dependencies, CSP-safe (inline). */
(function(){var s=document.getElementById('ai-artifact-provenance');if(!s)return;var d;try{d=JSON.parse(s.textContent)}catch(e){return}
function E(x){return String(x==null?'':x).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function O(x,k){return typeof x==='string'?(function(o){o[k]=x;return o})({}):(x||{})}
function L(a,f){return (a||[]).map(function(x){return '<li>'+f(x)+'</li>'}).join('')}
var g=d.generator||{},cl=d.changelog||[],last=cl.length?cl[cl.length-1].version:1,h='';
h+='<p class="aap-meta"><b>'+E(d.status)+'</b> · owner '+E(d.owner)+' · '+E(g.tool)+(g.model?' / '+E(g.model):'')+' · updated '+E(d.updated)+'</p>';
h+='<h4>The ask</h4><blockquote>'+E(d.ask)+'</blockquote>';
if(d.purpose||d.audience)h+='<p>'+(d.purpose?'<b>Purpose:</b> '+E(d.purpose)+' ':'')+(d.audience?'<b>Audience:</b> '+E(d.audience):'')+'</p>';
if((d.constraints||[]).length)h+='<h4>Constraints given</h4><ul>'+L(d.constraints,function(c){c=O(c,'quote');return '“'+E(c.quote)+'”'+(c.source?' <i>('+E(c.source)+')</i>':'')})+'</ul>';
if((d.assumptions||[]).length)h+='<h4>Assumptions the AI made</h4><ul>'+L(d.assumptions,function(a){a=O(a,'text');return E(a.text)+' <i>('+(a.confirmed?'confirmed':'unconfirmed')+')</i>'})+'</ul>';
if((d.decisions||[]).length)h+='<h4>Decisions</h4><ul>'+L(d.decisions,function(x,i){x=O(x,'decision');var r=x.rejected||[];return '<b>'+E(x.id||'D'+(i+1))+'</b> '+E(x.decision)+(x.why?' — '+E(x.why):'')+(x.quote?' <i>“'+E(x.quote)+'”</i>':'')+(x.superseded_by?' <s>superseded by '+E(x.superseded_by)+'</s>':'')+(r.length?'<ul>'+L(r,function(q){q=O(q,'option');return 'Rejected: '+E(q.option)+(q.why?' — '+E(q.why):'')})+'</ul>':'')})+'</ul>';
if((d.unknowns||[]).length)h+='<h4>Not verified</h4><ul>'+L(d.unknowns,function(u){u=O(u,'text');return E(u.text)+(u.how_to_check?' <i>('+E(u.how_to_check)+')</i>':'')})+'</ul>';
if((d.inputs||[]).length)h+='<h4>Inputs</h4><ul>'+L(d.inputs,function(i){i=O(i,'name');return E(i.name)+(i.as_of?' <i>as of '+E(i.as_of)+'</i>':'')+(i.note?' — '+E(i.note):'')})+'</ul>';
if(cl.length)h+='<h4>Versions</h4><ol reversed>'+cl.slice().reverse().map(function(c){return '<li>v'+E(c.version)+' · '+E(c.date)+' · <i>“'+E(c.trigger)+'”</i>'+(c.changed?' → '+E(c.changed):'')+'</li>'}).join('')+'</ol>';
var ks=Object.keys(d.links||{}).filter(function(k){return d.links[k]});if(ks.length)h+='<p>'+ks.map(function(k){return '<a href="'+E(d.links[k])+'">'+E(k)+'</a>'}).join(' · ')+'</p>';
if(d.how_to_question)h+='<p><b>To question this:</b> '+E(d.how_to_question)+'</p>';
var el=document.createElement('details');el.className='ai-artifact-provenance-panel';el.setAttribute('data-ai-artifact-provenance-panel','');el.innerHTML='<summary>How this document was made · '+E(d.status)+' · v'+E(last)+'</summary>'+h;
var st=document.createElement('style');st.textContent='.ai-artifact-provenance-panel{font:14px/1.5 system-ui,sans-serif;border:1px solid #c9c9c9;border-radius:6px;padding:8px 14px;margin:0 0 20px;background:#fafafa;color:#222}.ai-artifact-provenance-panel summary{cursor:pointer;font-weight:600}.ai-artifact-provenance-panel h4{margin:12px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;opacity:.7}.ai-artifact-provenance-panel ul,.ai-artifact-provenance-panel ol{margin:0;padding-left:20px}.ai-artifact-provenance-panel blockquote{margin:0;padding-left:10px;border-left:3px solid #999}.aap-meta{margin:6px 0 0;opacity:.8}@media (prefers-color-scheme:dark){.ai-artifact-provenance-panel{background:#1c1c1e;border-color:#444;color:#e6e6e6}.ai-artifact-provenance-panel blockquote{border-color:#666}}';
document.head.appendChild(st);document.body.insertBefore(el,document.body.firstChild)})();
