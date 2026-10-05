import express from 'express';
import crypto from 'node:crypto';
import {store,appendAudit,now} from '../db.js';
import {auth,allow} from '../middleware.js';
const router=express.Router();router.use(auth);
function reference(){let r;do{r=`INC-${new Date().getUTCFullYear()}-${crypto.randomInt(1,10000).toString().padStart(4,'0')}`}while(store.incidents().some(x=>x.reference===r));return r;}
router.get('/',(req,res)=>{const users=store.users();const rows=store.incidents().sort((a,b)=>b.id-a.id).map(i=>({...i,creator_name:users.find(u=>u.id===i.created_by)?.name||'Inconnu',evidence_count:store.evidence().filter(e=>e.incident_id===i.id).length}));res.json({incidents:rows});});
router.get('/:id',(req,res)=>{const i=store.incidentById(req.params.id);if(!i)return res.status(404).json({error:'Incident introuvable'});const users=store.users();const evidence=store.evidence().filter(e=>e.incident_id===i.id).sort((a,b)=>b.id-a.id).map(e=>({...e,collector_name:users.find(u=>u.id===e.collected_by)?.name||'Inconnu'}));res.json({incident:{...i,creator_name:users.find(u=>u.id===i.created_by)?.name||'Inconnu'},evidence});});
router.post('/',(req,res)=>res.status(405).json({error:'Création manuelle désactivée. Les incidents sont générés automatiquement par la détection SNMP.'}));
router.patch('/:id',allow('ADMIN','INVESTIGATOR'),(req,res)=>{const i=store.incidentById(req.params.id);if(!i)return res.status(404).json({error:'Incident introuvable'});const patch={title:req.body.title!==undefined?String(req.body.title).trim():i.title,description:req.body.description!==undefined?String(req.body.description).trim():i.description,status:req.body.status!==undefined?String(req.body.status):i.status,updated_at:now()};if(!patch.title||!['OPEN','INVESTIGATING','CONTAINED','CLOSED'].includes(patch.status))return res.status(400).json({error:'Données invalides'});store.updateIncident(i.id,patch);appendAudit(req.user.id,'INCIDENT_UPDATED','INCIDENT',i.id,{title:patch.title,status:patch.status});res.json({ok:true});});
export default router;
