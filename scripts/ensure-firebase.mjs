// Prepara el proyecto de Firebase antes de desplegar (lo ejecuta GitHub Actions).
// Todo es idempotente: si algo ya está hecho, no lo toca.
import { appendFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const PROJECT = 'montra-832b1';
const PROJECT_NUMBER = '329930396311';
const SITE = 'montra-gestion';
const DEFAULT_DB_LOCATION = 'europe-southwest1'; // Madrid, solo si la base de datos no existe aún
const AUTH_DOMAINS = ['localhost', `${PROJECT}.firebaseapp.com`, `${PROJECT}.web.app`, `${SITE}.web.app`, `${SITE}.firebaseapp.com`];
const APIS = [
  'firebase.googleapis.com',
  'firestore.googleapis.com',
  'firebaserules.googleapis.com',
  'firebasehosting.googleapis.com',
  'identitytoolkit.googleapis.com',
  'fcm.googleapis.com',
  'cloudfunctions.googleapis.com',
  'cloudbuild.googleapis.com',
  'artifactregistry.googleapis.com',
  'cloudscheduler.googleapis.com',
  'run.googleapis.com',
  'eventarc.googleapis.com',
  'pubsub.googleapis.com',
  'storage.googleapis.com',
  'iam.googleapis.com',
  'cloudresourcemanager.googleapis.com',
  'cloudbilling.googleapis.com', // Firebase comprueba el plan Blaze antes de desplegar funciones
  'firebaseextensions.googleapis.com',
];

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'] });
const client = await auth.getClient();
const summary = [];
const warn = (msg) => {
  console.log(`::warning::${msg}`);
  summary.push(`⚠️ ${msg}`);
};
const ok = (msg) => {
  console.log(`✓ ${msg}`);
  summary.push(`✅ ${msg}`);
};

async function api(method, url, data) {
  const res = await client.request({ method, url, data, validateStatus: () => true });
  return { status: res.status, data: res.data };
}

async function waitOperation(base, op, label) {
  for (let i = 0; i < 60 && !op.done; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const r = await api('GET', `${base}/${op.name}`);
    if (r.status !== 200) break;
    op = r.data;
  }
  if (op.error) throw new Error(`${label}: ${JSON.stringify(op.error)}`);
  return op;
}

// 1. APIs de Google Cloud
{
  const r = await api('POST', `https://serviceusage.googleapis.com/v1/projects/${PROJECT_NUMBER}/services:batchEnable`, { serviceIds: APIS });
  if (r.status === 200) {
    try {
      await waitOperation('https://serviceusage.googleapis.com/v1', r.data, 'Activar APIs');
      ok('APIs de Google Cloud activadas');
    } catch (e) {
      warn(`No se pudieron activar todas las APIs: ${e.message}`);
    }
  } else warn(`No se pudieron activar las APIs (HTTP ${r.status}): ${JSON.stringify(r.data?.error?.message ?? r.data)}`);
}

// 2. Base de datos Firestore
let location = DEFAULT_DB_LOCATION;
{
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`;
  let r = await api('GET', url);
  if (r.status === 404) {
    const c = await api('POST', `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases?databaseId=(default)`, {
      type: 'FIRESTORE_NATIVE',
      locationId: DEFAULT_DB_LOCATION,
    });
    if (c.status !== 200) throw new Error(`No se pudo crear Firestore (HTTP ${c.status}): ${JSON.stringify(c.data)}`);
    await waitOperation('https://firestore.googleapis.com/v1', c.data, 'Crear Firestore');
    r = await api('GET', url);
    ok(`Base de datos Firestore creada en ${DEFAULT_DB_LOCATION}`);
  }
  if (r.status !== 200) throw new Error(`No se pudo leer Firestore (HTTP ${r.status}): ${JSON.stringify(r.data)}`);
  location = r.data.locationId;
  ok(`Firestore en ${location}`);
}

// 3. Sitio de Hosting montra-gestion.web.app
let gestion = false;
{
  const base = `https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT}/sites`;
  const r = await api('GET', `${base}/${SITE}`);
  if (r.status === 200) gestion = true;
  else {
    const c = await api('POST', `${base}?siteId=${SITE}`, {});
    if (c.status === 200) {
      gestion = true;
      ok(`Sitio ${SITE}.web.app creado`);
    } else warn(`No se pudo crear ${SITE}.web.app (HTTP ${c.status}): ${c.data?.error?.message ?? ''}`);
  }
  if (gestion) ok(`Hosting: https://${SITE}.web.app`);
}

// 4. Dominios autorizados para el inicio de sesión
{
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;
  const r = await api('GET', url);
  if (r.status === 200) {
    const current = r.data.authorizedDomains ?? [];
    const merged = [...new Set([...current, ...AUTH_DOMAINS])];
    if (merged.length !== current.length) {
      const p = await api('PATCH', `${url}?updateMask=authorizedDomains`, { authorizedDomains: merged });
      if (p.status === 200) ok('Dominios autorizados actualizados');
      else warn(`No se pudieron autorizar los dominios (HTTP ${p.status})`);
    } else ok('Dominios autorizados correctos');
    const google = await api('GET', `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/defaultSupportedIdpConfigs/google.com`);
    if (google.status === 200 && google.data.enabled) ok('Inicio de sesión con Google activado');
    else warn('El proveedor Google no aparece activado en Authentication');
  } else warn(`No se pudo leer la configuración de Authentication (HTTP ${r.status})`);
}

// 5. Permiso de compilación para Cloud Functions (cuenta de servicio de Compute)
{
  const rm = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`;
  const r = await api('POST', `${rm}:getIamPolicy`, { options: { requestedPolicyVersion: 3 } });
  if (r.status === 200) {
    const policy = r.data;
    const compute = `serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com`;
    const pubsub = `serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com`;
    // Los que pide Cloud Functions (2.ª gen.) para compilar y para los disparadores programados y de Firestore
    const grants = [
      [compute, 'roles/cloudbuild.builds.builder'],
      [compute, 'roles/run.invoker'],
      [compute, 'roles/eventarc.eventReceiver'],
      [pubsub, 'roles/iam.serviceAccountTokenCreator'],
    ];
    let changed = false;
    for (const [member, role] of grants) {
      let b = policy.bindings.find((x) => x.role === role && !x.condition);
      if (!b) policy.bindings.push((b = { role, members: [] }));
      if (!b.members.includes(member)) {
        b.members.push(member);
        changed = true;
      }
    }
    if (changed) {
      const s = await api('POST', `${rm}:setIamPolicy`, { policy });
      if (s.status === 200) ok('Permisos de Cloud Functions concedidos');
      else warn(`No se pudieron conceder permisos a Cloud Functions (HTTP ${s.status})`);
    } else ok('Permisos de Cloud Functions correctos');
  } else warn(`No se pudo leer la política IAM (HTTP ${r.status})`);
}

const hosting = gestion ? 'hosting:gestion,hosting:main' : 'hosting:main';
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `hosting=${hosting}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Preparación de Firebase\n\n${summary.join('\n\n')}\n`);
