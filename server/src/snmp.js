import crypto from 'node:crypto';
import { appendAudit, now, store } from './db.js';

let snmp;
try { const mod = await import('net-snmp'); snmp = mod.default ?? mod; } catch { snmp = null; }

const OIDS = {
  sysName: '1.3.6.1.2.1.1.5.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0'
};

function severityFor(signal) {
  if (signal.type === 'INTERFACE_DOWN') return 'CRITICAL';
  if (signal.type === 'AUTH_FAILURE') return 'HIGH';
  if (signal.type === 'HIGH_ERROR_RATE') return 'HIGH';
  if (signal.type === 'DEVICE_UNREACHABLE') return 'CRITICAL';
  return 'MEDIUM';
}

function makeReference() {
  let ref;
  do ref = `INC-${new Date().getUTCFullYear()}-${crypto.randomInt(1, 10000).toString().padStart(4, '0')}`;
  while (store.incidents().some(i => i.reference === ref));
  return ref;
}

function activeDuplicate(device, signal) {
  const needle = `${device.name}:${signal.type}:${signal.interface || ''}`;
  return store.incidents().some(i => i.status !== 'CLOSED' && i.detection_key === needle);
}

export function createAutomaticIncident({ device, signal, actorId = null }) {
  if (activeDuplicate(device, signal)) return null;
  const t = now();
  const severity = severityFor(signal);
  const title = signal.interface
    ? `${signal.type === 'INTERFACE_DOWN' ? 'Interface indisponible' : 'Alerte SNMP'} — ${device.name} / ${signal.interface}`
    : `${signal.type.replaceAll('_', ' ')} — ${device.name}`;
  const description = [
    'Incident créé automatiquement par le moteur de détection SNMP.',
    `Équipement : ${device.name} (${device.host}).`,
    signal.message,
    `Source : SNMP${signal.demo ? ' (mode démonstration)' : ''}.`,
    `Détecté le : ${t}.`
  ].join('\n');
  const incident = store.addIncident({
    reference: makeReference(), title, description, severity,
    status: 'OPEN', reporter: `SNMP:${device.name}`, created_by: actorId,
    detection_source: 'SNMP', detection_key: `${device.name}:${signal.type}:${signal.interface || ''}`,
    created_at: t, updated_at: t
  });
  appendAudit(actorId, 'INCIDENT_AUTO_CREATED', 'INCIDENT', incident.id, {
    source: 'SNMP', device: device.name, host: device.host, signal, severity
  });
  return incident;
}

function parseDevices() {
  try {
    const list = JSON.parse(process.env.SNMP_DEVICES || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

async function pollDevice(device) {
  if (!snmp) throw new Error('Le module net-snmp n\'est pas installé');
  const session = snmp.createSession(device.host, device.community || 'public', {
    version: snmp.Version2c,
    timeout: Number(device.timeout || 1500),
    retries: Number(device.retries ?? 1)
  });
  try {
    const values = await new Promise((resolve, reject) => session.get([OIDS.sysName, OIDS.sysUpTime], (err, varbinds) => err ? reject(err) : resolve(varbinds)));
    const sysName = values[0]?.value?.toString?.() || device.name || device.host;
    const upTime = values[1]?.value?.toString?.() || 'inconnu';
    const result = { name: device.name || sysName, host: device.host, reachable: true, sysName, upTime, checkedAt: now() };

    // Generic interface monitoring. This works with standard IF-MIB on most switches/routers.
    const interfaces = [];
    await new Promise((resolve) => session.subtree('1.3.6.1.2.1.2.2.1.8', 20, (varbinds) => {
      for (const vb of varbinds) {
        const ifIndex = vb.oid.split('.').at(-1);
        const status = Number(vb.value);
        interfaces.push({ ifIndex, status });
      }
    }, () => resolve()));
    result.interfaces = interfaces;
    return result;
  } finally { session.close(); }
}

export function startSnmpMonitor() {
  const intervalMs = Math.max(10000, Number(process.env.SNMP_POLL_INTERVAL_MS || 60000));
  const devices = parseDevices();
  const demo = String(process.env.SNMP_DEMO_MODE || 'false').toLowerCase() === 'true';

  async function tick() {
    if (demo) {
      const device = { name: 'LAB-SWITCH-01', host: '192.0.2.10' };
      const incident = createAutomaticIncident({ device, signal: {
        type: 'INTERFACE_DOWN', interface: 'Gi0/24',
        message: 'SNMP IF-MIB indique que l\'interface est administrativement/ opérationnellement indisponible.', demo: true
      }});
      if (incident) console.log(`[SNMP-DEMO] Incident automatique ${incident.reference} (${incident.severity})`);
      return;
    }
    for (const device of devices) {
      try {
        const result = await pollDevice(device);
        for (const intf of result.interfaces || []) {
          if (intf.status === 2) {
            const incident = createAutomaticIncident({ device: { ...device, name: result.sysName || device.name }, signal: {
              type: 'INTERFACE_DOWN', interface: `ifIndex ${intf.ifIndex}`,
              message: `IF-MIB ifOperStatus indique DOWN (index ${intf.ifIndex}).`
            }});
            if (incident) console.log(`[SNMP] Incident automatique ${incident.reference} (${incident.severity})`);
          }
        }
      } catch (err) {
        const incident = createAutomaticIncident({ device, signal: {
          type: 'DEVICE_UNREACHABLE', message: `Équipement SNMP injoignable : ${err.message}`
        }});
        if (incident) console.log(`[SNMP] Incident automatique ${incident.reference} (${incident.severity})`);
      }
    }
  }

  // Récepteur de traps SNMP optionnel pour un déploiement sur un réseau où un port UDP est disponible.
  if (snmp && process.env.SNMP_TRAP_PORT) {
    try {
      const receiver = snmp.createReceiver({
        port: Number(process.env.SNMP_TRAP_PORT),
        disableAuthorization: false,
        transport: 'udp4'
      }, (error, notification) => {
        if (error) { console.error('[SNMP-TRAP]', error.message || error); return; }
        const source = notification?.rinfo?.address || 'unknown';
        const pdu = notification?.pdu || {};
        const varbinds = pdu.varbinds || [];
        const trapOid = varbinds.find(v => v.oid === '1.3.6.1.6.3.1.1.4.1.0')?.value?.toString?.() || '';
        const type = trapOid === '1.3.6.1.6.3.1.1.5.3' ? 'LINK_DOWN' : trapOid === '1.3.6.1.6.3.1.1.5.5' ? 'AUTH_FAILURE' : 'SNMP_TRAP';
        const signalType = type === 'LINK_DOWN' ? 'INTERFACE_DOWN' : type;
        const incident = createAutomaticIncident({
          device: {name: `SNMP-${source}`, host: source},
          signal: {type: signalType, message: `Trap SNMP reçu depuis ${source}${trapOid ? ` (OID ${trapOid})` : ''}.`, trapOid}
        });
        if (incident) console.log(`[SNMP-TRAP] Incident automatique ${incident.reference} (${incident.severity})`);
      });
      console.log(`[SNMP] Récepteur de traps actif sur UDP/${process.env.SNMP_TRAP_PORT}`);
      receiver.on?.('error', err => console.error('[SNMP-TRAP]', err));
    } catch (err) { console.error('[SNMP] Impossible de démarrer le récepteur de traps:', err.message); }
  }

  if (demo || devices.length) {
    console.log(`[SNMP] Supervision active: ${demo ? 'mode démonstration' : `${devices.length} équipement(s)`}; intervalle ${intervalMs} ms`);
    tick();
    return setInterval(tick, intervalMs);
  }
  console.log('[SNMP] Aucun équipement configuré. Définissez SNMP_DEVICES ou activez SNMP_DEMO_MODE=true pour la démonstration.');
  return null;
}

export { parseDevices, severityFor };
