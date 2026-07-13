
"use client";

export type Contract = {
  id: string;
  contractNumber: string;
  clientName: string;
  object: string;
  contractValue: number;
  measuredValue: number;
  receivedValue: number;
  status: string;
  createdAt: string;
};

export type Bid = {
  id: string;
  title: string;
  agency: string;
  sessionDate: string;
  estimatedValue: number;
  status: string;
  createdAt: string;
};

const CONTRACTS_KEY = "enghub_contracts_v1";
const BIDS_KEY = "enghub_bids_v1";

const seedContracts: Contract[] = [
  {
    id: "c1",
    contractNumber: "097/2025",
    clientName: "Prefeitura Municipal",
    object: "Cobertura de pátio escolar",
    contractValue: 420000,
    measuredValue: 310000,
    receivedValue: 260000,
    status: "Em execução",
    createdAt: new Date().toISOString()
  },
  {
    id: "c2",
    contractNumber: "014/2026",
    clientName: "Universidade Federal",
    object: "Reforma de blocos universitários",
    contractValue: 680000,
    measuredValue: 173200,
    receivedValue: 132100,
    status: "Em execução",
    createdAt: new Date().toISOString()
  }
];

const seedBids: Bid[] = [
  {
    id: "b1",
    title: "Reforma escolar",
    agency: "Prefeitura Municipal",
    sessionDate: "2026-07-18",
    estimatedValue: 380000,
    status: "Em análise",
    createdAt: new Date().toISOString()
  },
  {
    id: "b2",
    title: "Rede de esgoto",
    agency: "Companhia de Saneamento",
    sessionDate: "2026-07-24",
    estimatedValue: 1250000,
    status: "Participar",
    createdAt: new Date().toISOString()
  }
];

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("enghub:data"));
}

export function getContracts() {
  return read<Contract[]>(CONTRACTS_KEY, seedContracts);
}
export function saveContracts(items: Contract[]) {
  write(CONTRACTS_KEY, items);
}
export function addContract(item: Omit<Contract, "id" | "createdAt">) {
  const current = getContracts();
  const next: Contract = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  saveContracts([next, ...current]);
  return next;
}
export function removeContract(id: string) {
  saveContracts(getContracts().filter(c => c.id !== id));
}

export function getBids() {
  return read<Bid[]>(BIDS_KEY, seedBids);
}
export function saveBids(items: Bid[]) {
  write(BIDS_KEY, items);
}
export function addBid(item: Omit<Bid, "id" | "createdAt">) {
  const current = getBids();
  const next: Bid = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  saveBids([next, ...current]);
  return next;
}
export function removeBid(id: string) {
  saveBids(getBids().filter(b => b.id !== id));
}

export function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}


export type Measurement = {
  id: string;
  contractId: string;
  number: string;
  competence: string;
  measuredValue: number;
  invoiceNumber: string;
  status: string;
  receivedValue: number;
  createdAt: string;
};

export type Addendum = {
  id: string;
  contractId: string;
  type: string;
  description: string;
  value: number;
  days: number;
  status: string;
  createdAt: string;
};

export type ContractDocument = {
  id: string;
  contractId: string;
  name: string;
  category: string;
  expiryDate: string;
  status: string;
  createdAt: string;
};

const MEASUREMENTS_KEY = "enghub_measurements_v1";
const ADDENDA_KEY = "enghub_addenda_v1";
const DOCUMENTS_KEY = "enghub_documents_v1";

export function getMeasurements() {
  return read<Measurement[]>(MEASUREMENTS_KEY, []);
}
export function getMeasurementsByContract(contractId: string) {
  return getMeasurements().filter(m => m.contractId === contractId);
}
export function addMeasurement(item: Omit<Measurement,"id"|"createdAt">) {
  const next: Measurement = {...item,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
  write(MEASUREMENTS_KEY,[next,...getMeasurements()]);
  syncContractTotals(item.contractId);
  return next;
}
export function removeMeasurement(id:string){
  const all=getMeasurements();
  const found=all.find(m=>m.id===id);
  write(MEASUREMENTS_KEY,all.filter(m=>m.id!==id));
  if(found) syncContractTotals(found.contractId);
}

export function getAddenda() {
  return read<Addendum[]>(ADDENDA_KEY, []);
}
export function getAddendaByContract(contractId:string){
  return getAddenda().filter(a=>a.contractId===contractId);
}
export function addAddendum(item:Omit<Addendum,"id"|"createdAt">){
  const next:Addendum={...item,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
  write(ADDENDA_KEY,[next,...getAddenda()]);
  return next;
}
export function removeAddendum(id:string){
  write(ADDENDA_KEY,getAddenda().filter(a=>a.id!==id));
}

export function getDocuments(){
  return read<ContractDocument[]>(DOCUMENTS_KEY,[]);
}
export function getDocumentsByContract(contractId:string){
  return getDocuments().filter(d=>d.contractId===contractId);
}
export function addDocument(item:Omit<ContractDocument,"id"|"createdAt">){
  const next:ContractDocument={...item,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
  write(DOCUMENTS_KEY,[next,...getDocuments()]);
  return next;
}
export function removeDocument(id:string){
  write(DOCUMENTS_KEY,getDocuments().filter(d=>d.id!==id));
}

export function getContract(id:string){
  return getContracts().find(c=>c.id===id);
}

export function updateContract(id:string, patch:Partial<Contract>){
  const all=getContracts();
  saveContracts(all.map(c=>c.id===id?{...c,...patch}:c));
}

export function syncContractTotals(contractId:string){
  const ms=getMeasurementsByContract(contractId);
  const measuredValue=ms.reduce((a,m)=>a+m.measuredValue,0);
  const receivedValue=ms.reduce((a,m)=>a+m.receivedValue,0);
  updateContract(contractId,{measuredValue,receivedValue});
}


export type CompanyProfile = {
  companyName: string;
  cnpj: string;
  responsibleName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
};

export type ScheduleItem = {
  id: string;
  contractId: string;
  stage: string;
  activity: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string;
  actualEnd: string;
  progress: number;
  status: string;
  responsible: string;
  createdAt: string;
};

export type TaskItem = {
  id: string;
  contractId: string;
  title: string;
  dueDate: string;
  priority: string;
  status: string;
  responsible: string;
  createdAt: string;
};

export type UploadedDocument = {
  id: string;
  contractId: string;
  name: string;
  category: string;
  expiryDate: string;
  status: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
};

const PROFILE_KEY = "enghub_company_profile_v1";
const TEAM_KEY = "enghub_team_v1";
const SCHEDULE_KEY = "enghub_schedule_v1";
const TASKS_KEY = "enghub_tasks_v1";
const UPLOADS_KEY = "enghub_uploads_v1";

export function getProfile(): CompanyProfile {
  return read<CompanyProfile>(PROFILE_KEY,{
    companyName:"",cnpj:"",responsibleName:"",email:"",phone:"",city:"",state:""
  });
}
export function saveProfile(profile:CompanyProfile){ write(PROFILE_KEY,profile); }

export function getTeam(){ return read<TeamMember[]>(TEAM_KEY,[]); }
export function addTeamMember(item:Omit<TeamMember,"id"|"createdAt">){
  const next:TeamMember={...item,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
  write(TEAM_KEY,[next,...getTeam()]);
  return next;
}
export function removeTeamMember(id:string){ write(TEAM_KEY,getTeam().filter(x=>x.id!==id)); }

export function getSchedule(){ return read<ScheduleItem[]>(SCHEDULE_KEY,[]); }
export function getScheduleByContract(contractId:string){ return getSchedule().filter(x=>x.contractId===contractId); }
export function addScheduleItem(item:Omit<ScheduleItem,"id"|"createdAt">){
  const next:ScheduleItem={...item,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
  write(SCHEDULE_KEY,[next,...getSchedule()]);
  return next;
}
export function removeScheduleItem(id:string){ write(SCHEDULE_KEY,getSchedule().filter(x=>x.id!==id)); }

export function getTasks(){ return read<TaskItem[]>(TASKS_KEY,[]); }
export function getTasksByContract(contractId:string){ return getTasks().filter(x=>x.contractId===contractId); }
export function addTask(item:Omit<TaskItem,"id"|"createdAt">){
  const next:TaskItem={...item,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
  write(TASKS_KEY,[next,...getTasks()]);
  return next;
}
export function removeTask(id:string){ write(TASKS_KEY,getTasks().filter(x=>x.id!==id)); }

export function getUploads(){ return read<UploadedDocument[]>(UPLOADS_KEY,[]); }
export function getUploadsByContract(contractId:string){ return getUploads().filter(x=>x.contractId===contractId); }
export function addUpload(item:Omit<UploadedDocument,"id"|"createdAt">){
  const next:UploadedDocument={...item,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
  write(UPLOADS_KEY,[next,...getUploads()]);
  return next;
}
export function removeUpload(id:string){ write(UPLOADS_KEY,getUploads().filter(x=>x.id!==id)); }
