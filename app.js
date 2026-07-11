const SUPABASE_URL='https://pdemjgsjhuuaoevhrewm.supabase.co';
const SUPABASE_KEY='sb_publishable_BJom2NIB22-MKQJ0mRi3GQ_Yv-IS0-r';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let authMode='login';
let currentUser=null;
let currentOrgId=null;
let contracts=[];
let bids=[];
let currentContract=null;

const $=id=>document.getElementById(id);
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateBR=v=>v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR'):'—';
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

async function ensureOrganization(){
  const {data,error}=await db.from('organization_members').select('organization_id').eq('user_id',currentUser.id).eq('status','active').limit(1).maybeSingle();
  if(error) throw error;
  if(data){currentOrgId=data.organization_id;return}
  // fallback for accounts created before trigger existed
  const {data:org,error:orgErr}=await db.from('organizations').insert({name:'Minha Empresa',created_by:currentUser.id}).select().single();
  if(orgErr) throw orgErr;
  const {error:memErr}=await db.from('organization_members').insert({organization_id:org.id,user_id:currentUser.id,role:'owner',status:'active'});
  if(memErr) throw memErr;
  currentOrgId=org.id;
}

async function init(){
  const {data:{session}}=await db.auth.getSession();
  if(session){currentUser=session.user;await startApp()}else showAuth();
}

function showAuth(){$('authView').classList.remove('hidden');$('appView').classList.add('hidden')}
async function startApp(){
  try{
    await ensureOrganization();
    $('authView').classList.add('hidden');$('appView').classList.remove('hidden');
    $('userBadge').textContent=currentUser.email||'Conectado';
    await refreshAll();
  }catch(e){$('authMessage').textContent=e.message;showAuth()}
}

$('authForm').addEventListener('submit',async e=>{
  e.preventDefault();$('authMessage').textContent='Aguarde...';
  const email=$('authEmail').value.trim();const password=$('authPassword').value;
  const result=authMode==='login'?await db.auth.signInWithPassword({email,password}):await db.auth.signUp({email,password});
  if(result.error){$('authMessage').textContent=result.error.message;return}
  if(authMode==='signup'&&!result.data.session){$('authMessage').textContent='Cadastro criado. Confirme seu e-mail e depois entre.';return}
  currentUser=result.data.user;await startApp();
});
$('toggleAuth').addEventListener('click',()=>{
  authMode=authMode==='login'?'signup':'login';
  $('authTitle').textContent=authMode==='login'?'Entrar na plataforma':'Criar sua conta';
  $('authForm').querySelector('button').textContent=authMode==='login'?'Entrar':'Cadastrar';
  $('toggleAuth').textContent=authMode==='login'?'Criar conta':'Já tenho conta';
  $('authMessage').textContent='';
});
$('logoutBtn').addEventListener('click',async()=>{await db.auth.signOut();location.reload()});

const pageMeta={dashboard:['Dashboard','Visão geral da operação'],contracts:['Contratos','Gestão dos contratos ganhos'],bids:['Licitações','Editais, prazos e oportunidades'],knowledge:['Central de Conhecimento','Guias e materiais práticos']};
document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  $(`${name}Page`).classList.add('active');
  $('pageTitle').textContent=pageMeta[name][0];$('pageSubtitle').textContent=pageMeta[name][1];
}

async function refreshAll(){await Promise.all([loadContracts(),loadBids()]);renderDashboard()}
async function loadContracts(){
  const {data,error}=await db.from('contracts').select('*').order('created_at',{ascending:false});if(error)throw error;contracts=data||[];renderContracts();
}
async function loadBids(){
  const {data,error}=await db.from('bids').select('*').order('created_at',{ascending:false});if(error)throw error;bids=data||[];renderBids();
}
function renderDashboard(){
  const total=k=>contracts.reduce((a,c)=>a+Number(c[k]||0),0);
  $('kpiContract').textContent=money(total('contract_value'));$('kpiMeasured').textContent=money(total('measured_value'));$('kpiReceived').textContent=money(total('received_value'));$('kpiBids').textContent=bids.length;
  $('dashContracts').innerHTML=contracts.slice(0,6).map(c=>`<tr><td>${esc(c.contract_number)}</td><td>${esc(c.client_name)}</td><td>${esc(c.status)}</td></tr>`).join('')||'<tr><td colspan="3">Nenhum contrato cadastrado.</td></tr>';
  const pending=Math.max(0,total('measured_value')-total('received_value'));
  $('alerts').innerHTML=`<div class="alert">${money(pending)} medidos e ainda não recebidos.</div><div class="alert">${contracts.length} contrato(s) cadastrado(s).</div><div class="alert">${bids.length} licitação(ões) acompanhada(s).</div>`;
}
function renderContracts(){
  $('contractsBody').innerHTML=contracts.map(c=>`<tr><td><button class="link-btn" onclick="openContract('${c.id}')">${esc(c.contract_number)}</button></td><td>${esc(c.object)}</td><td>${money(c.contract_value)}</td><td>${money(c.measured_value)}</td><td>${money(c.received_value)}</td><td>${esc(c.status)}</td><td><button class="danger" onclick="deleteContract('${c.id}')">Excluir</button></td></tr>`).join('')||'<tr><td colspan="7">Nenhum contrato cadastrado.</td></tr>';
}
function renderBids(){
  $('bidsBody').innerHTML=bids.map(b=>`<tr><td>${esc(b.title)}</td><td>${esc(b.agency)}</td><td>${dateBR((b.session_date||'').slice(0,10))}</td><td>${money(b.estimated_value)}</td><td>${esc(b.status)}</td><td><button class="danger" onclick="deleteBid('${b.id}')">Excluir</button></td></tr>`).join('')||'<tr><td colspan="6">Nenhuma licitação cadastrada.</td></tr>';
}

function openModal(title,fields,onSubmit){
  $('modalTitle').textContent=title;const form=$('modalForm');form.innerHTML=fields;form.onsubmit=async e=>{e.preventDefault();try{await onSubmit(new FormData(form));closeModal();toast('Salvo com sucesso.')}catch(err){toast(err.message)}};$('modal').classList.remove('hidden');
}
function closeModal(){$('modal').classList.add('hidden');$('modalForm').innerHTML=''}
$('closeModal').addEventListener('click',closeModal);$('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal()});

$('newContractBtn').addEventListener('click',()=>openModal('Novo contrato',`
<label>Número<input name="number" required></label><label>Órgão/Cliente<input name="client" required></label><label class="full">Objeto<input name="object" required></label><label>Valor<input name="value" type="number" step="0.01" required></label><label>Status<select name="status"><option>Planejamento</option><option>Em execução</option><option>Paralisado</option><option>Concluído</option></select></label><button class="btn full">Salvar</button>`,async f=>{
  const {error}=await db.from('contracts').insert({organization_id:currentOrgId,created_by:currentUser.id,contract_number:f.get('number'),client_name:f.get('client'),object:f.get('object'),contract_value:Number(f.get('value')||0),measured_value:0,received_value:0,status:f.get('status')});if(error)throw error;await loadContracts();renderDashboard();
}));
window.deleteContract=async id=>{if(!confirm('Excluir este contrato?'))return;const {error}=await db.from('contracts').delete().eq('id',id);if(error)return toast(error.message);await loadContracts();renderDashboard()};

$('newBidBtn').addEventListener('click',()=>openModal('Nova licitação',`
<label class="full">Objeto<input name="title" required></label><label class="full">Órgão<input name="agency" required></label><label>Data da sessão<input name="date" type="date"></label><label>Valor estimado<input name="value" type="number" step="0.01"></label><label class="full">Status<select name="status"><option>Em análise</option><option>Participar</option><option>Não participar</option><option>Proposta enviada</option><option>Vencida</option><option>Perdida</option></select></label><button class="btn full">Salvar</button>`,async f=>{
  const {error}=await db.from('bids').insert({organization_id:currentOrgId,created_by:currentUser.id,title:f.get('title'),agency:f.get('agency'),session_date:f.get('date')||null,estimated_value:Number(f.get('value')||0),status:f.get('status')});if(error)throw error;await loadBids();renderDashboard();
}));
window.deleteBid=async id=>{if(!confirm('Excluir esta licitação?'))return;const {error}=await db.from('bids').delete().eq('id',id);if(error)return toast(error.message);await loadBids();renderDashboard()};

window.openContract=async id=>{
  currentContract=contracts.find(c=>c.id===id);if(!currentContract)return;
  $('contractsPage').classList.remove('active');$('contractDetailPage').classList.add('active');
  $('detailTitle').textContent=`Contrato ${currentContract.contract_number}`;$('detailSubtitle').textContent=currentContract.object||'';
  await refreshContractDetail();
};
$('backContracts').addEventListener('click',()=>{$('contractDetailPage').classList.remove('active');$('contractsPage').classList.add('active')});
document.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(`${b.dataset.tab}Tab`).classList.add('active');
}));
async function refreshContractDetail(){
  const [{data:ms,error:me},{data:ads,error:ae},{data:docs,error:de}]=await Promise.all([
    db.from('measurements').select('*').eq('contract_id',currentContract.id).order('created_at',{ascending:false}),
    db.from('addenda').select('*').eq('contract_id',currentContract.id).order('created_at',{ascending:false}),
    db.from('contract_documents').select('*').eq('contract_id',currentContract.id).order('created_at',{ascending:false})
  ]);if(me||ae||de)throw(me||ae||de);
  const adjusted=Number(currentContract.contract_value||0)+(ads||[]).reduce((a,x)=>a+Number(x.value||0),0);
  $('detailOriginal').textContent=money(currentContract.contract_value);$('detailAdjusted').textContent=money(adjusted);$('detailMeasured').textContent=money(currentContract.measured_value);$('detailReceived').textContent=money(currentContract.received_value);
  $('measurementsBody').innerHTML=(ms||[]).map(m=>`<tr><td>${esc(m.number)}</td><td>${esc(m.competence)}</td><td>${money(m.measured_value)}</td><td>${esc(m.invoice_number)}</td><td>${esc(m.status)}</td><td>${money(m.received_value)}</td><td><button class="danger" onclick="deleteMeasurement('${m.id}')">Excluir</button></td></tr>`).join('')||'<tr><td colspan="7">Nenhuma medição.</td></tr>';
  $('addendaBody').innerHTML=(ads||[]).map(a=>`<tr><td>${esc(a.type)}</td><td>${esc(a.description)}</td><td>${money(a.value)}</td><td>${a.days||0}</td><td>${esc(a.status)}</td><td><button class="danger" onclick="deleteAddendum('${a.id}')">Excluir</button></td></tr>`).join('')||'<tr><td colspan="6">Nenhum aditivo.</td></tr>';
  $('documentsBody').innerHTML=(docs||[]).map(d=>`<tr><td>${esc(d.name)}</td><td>${esc(d.category)}</td><td>${esc(d.status)}</td><td>${new Date(d.created_at).toLocaleDateString('pt-BR')}</td><td><button class="danger" onclick="deleteDocument('${d.id}','${esc(d.storage_path||'')}')">Excluir</button></td></tr>`).join('')||'<tr><td colspan="5">Nenhum documento.</td></tr>';
}
async function syncContractTotals(){
  const {data,error}=await db.from('measurements').select('measured_value,received_value').eq('contract_id',currentContract.id);if(error)throw error;
  const measured=(data||[]).reduce((a,x)=>a+Number(x.measured_value||0),0),received=(data||[]).reduce((a,x)=>a+Number(x.received_value||0),0);
  const {error:e}=await db.from('contracts').update({measured_value:measured,received_value:received}).eq('id',currentContract.id);if(e)throw e;
  currentContract.measured_value=measured;currentContract.received_value=received;await loadContracts();renderDashboard();
}
$('newMeasurementBtn').addEventListener('click',()=>openModal('Nova medição',`
<label>Número<input name="number"></label><label>Competência<input name="competence"></label><label>Valor medido<input name="measured" type="number" step="0.01"></label><label>Nota fiscal<input name="invoice"></label><label>Valor recebido<input name="received" type="number" step="0.01"></label><label>Status<select name="status"><option>Em elaboração</option><option>Protocolada</option><option>Aprovada</option><option>Faturada</option><option>Recebida</option><option>Glosada</option></select></label><button class="btn full">Salvar</button>`,async f=>{
  const {error}=await db.from('measurements').insert({organization_id:currentOrgId,created_by:currentUser.id,contract_id:currentContract.id,number:f.get('number'),competence:f.get('competence'),measured_value:Number(f.get('measured')||0),invoice_number:f.get('invoice'),status:f.get('status'),received_value:Number(f.get('received')||0)});if(error)throw error;await syncContractTotals();await refreshContractDetail();
}));
window.deleteMeasurement=async id=>{if(!confirm('Excluir medição?'))return;const {error}=await db.from('measurements').delete().eq('id',id);if(error)return toast(error.message);await syncContractTotals();await refreshContractDetail()};

$('newAddendumBtn').addEventListener('click',()=>openModal('Novo aditivo',`
<label>Tipo<select name="type"><option>Valor</option><option>Prazo</option><option>Valor e Prazo</option><option>Supressão</option></select></label><label>Status<select name="status"><option>Identificado</option><option>Solicitado</option><option>Em análise</option><option>Aprovado</option><option>Formalizado</option></select></label><label class="full">Descrição<input name="description"></label><label>Valor<input name="value" type="number" step="0.01"></label><label>Dias<input name="days" type="number"></label><button class="btn full">Salvar</button>`,async f=>{
  const {error}=await db.from('addenda').insert({organization_id:currentOrgId,created_by:currentUser.id,contract_id:currentContract.id,type:f.get('type'),description:f.get('description'),value:Number(f.get('value')||0),days:Number(f.get('days')||0),status:f.get('status')});if(error)throw error;await refreshContractDetail();
}));
window.deleteAddendum=async id=>{if(!confirm('Excluir aditivo?'))return;const {error}=await db.from('addenda').delete().eq('id',id);if(error)return toast(error.message);await refreshContractDetail()};

$('documentFile').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file||!currentContract)return;
  try{toast('Enviando arquivo...');const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${currentOrgId}/${currentContract.id}/${crypto.randomUUID()}-${safe}`;const {error:up}=await db.storage.from('contract-files').upload(path,file);if(up)throw up;
    const {error}=await db.from('contract_documents').insert({organization_id:currentOrgId,created_by:currentUser.id,contract_id:currentContract.id,name:file.name,category:'Arquivo',status:'Válido',storage_path:path});if(error)throw error;toast('Arquivo enviado.');await refreshContractDetail();
  }catch(err){toast(err.message)}finally{e.target.value=''}
});
window.deleteDocument=async(id,path)=>{if(!confirm('Excluir documento?'))return;if(path)await db.storage.from('contract-files').remove([path]);const {error}=await db.from('contract_documents').delete().eq('id',id);if(error)return toast(error.message);await refreshContractDetail()};

init();
