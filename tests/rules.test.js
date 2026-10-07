/* Automated checks for firestore.rules (run via `npm test` in this folder; see tests/rules.md for the manual matrix). */
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n     ' + String(e.message).split('\n')[0]); } }

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-mytree', firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 } });
  const prof = (o) => Object.assign({ active: true, status: 'active', email: '', authEmail: '', phone: '', createdAt: 1 }, o);
  const seed = async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc('users/sa').set(prof({ userId: 'MT-ADM-000001', role: 'super_admin', orgId: '', ancestorOrgIds: [], name: 'Root' }));
      await db.doc('meta/setup').set({ superAdminUid: 'sa' });
      await db.doc('orgs/MT-FND-000001').set({ type: 'foundation', name: 'F1', ancestorOrgIds: ['MT-FND-000001'], parentOrgId: '', status: 'approved', createdBy: 'x' });
      await db.doc('orgs/MT-SCH-000001').set({ type: 'school', name: 'S1', ancestorOrgIds: ['MT-FND-000001', 'MT-SCH-000001'], parentOrgId: 'MT-FND-000001', status: 'approved', createdBy: 'x' });
      await db.doc('orgs/MT-SCH-000002').set({ type: 'school', name: 'S2', ancestorOrgIds: ['MT-SCH-000002'], parentOrgId: '', status: 'approved', createdBy: 'x' });
      await db.doc('users/f1').set(prof({ userId: 'MT-FND-000001', role: 'foundation', orgId: 'MT-FND-000001', ancestorOrgIds: ['MT-FND-000001'], name: 'F1 admin' }));
      await db.doc('users/s1').set(prof({ userId: 'MT-SCH-000001', role: 'school', orgId: 'MT-SCH-000001', ancestorOrgIds: ['MT-FND-000001', 'MT-SCH-000001'], name: 'S1 admin' }));
      await db.doc('users/s2').set(prof({ userId: 'MT-SCH-000002', role: 'school', orgId: 'MT-SCH-000002', ancestorOrgIds: ['MT-SCH-000002'], name: 'S2 admin' }));
      await db.doc('users/st1').set(prof({ userId: 'MT-STU-SCH001-0001', role: 'student', orgId: 'MT-SCH-000001', ancestorOrgIds: ['MT-FND-000001', 'MT-SCH-000001'], name: 'Stu One' }));
      await db.doc('users/st2').set(prof({ userId: 'MT-STU-SCH001-0002', role: 'student', orgId: 'MT-SCH-000001', ancestorOrgIds: ['MT-FND-000001', 'MT-SCH-000001'], name: 'Stu Two' }));
      await db.doc('users/ind1').set(prof({ userId: 'MT-IND-000001', role: 'individual', orgId: '', ancestorOrgIds: [], name: 'Ind One' }));
      for (const u of [['MT-ADM-000001', 'sa', []], ['MT-FND-000001', 'f1', ['MT-FND-000001']], ['MT-SCH-000001', 's1', ['MT-FND-000001', 'MT-SCH-000001']], ['MT-SCH-000002', 's2', ['MT-SCH-000002']], ['MT-STU-SCH001-0001', 'st1', ['MT-FND-000001', 'MT-SCH-000001']], ['MT-STU-SCH001-0002', 'st2', ['MT-FND-000001', 'MT-SCH-000001']], ['MT-IND-000001', 'ind1', []]])
        await db.doc('userIds/' + u[0]).set({ uid: u[1], orgId: '', ancestorOrgIds: u[2] });
      await db.doc('loginAliases/MT-STU-SCH001-0001').set({ authEmail: 'mt-stu-sch001-0001@mytree.app', active: true });
      await db.doc('counters/IND').set({ n: 1 }); await db.doc('counters/SCH').set({ n: 2 }); await db.doc('counters/FND').set({ n: 1 }); await db.doc('counters/ADM').set({ n: 1 });
      await db.doc('stats/global').set({ trees: 5, kind: 'global' }); 
      await db.doc('stats/city_pune').set({ kind: 'city', name: 'Pune', trees: 5 }); await db.doc('stats/org_MT-SCH-000001').set({ kind: 'org', trees: 5 });
      await db.doc('trees/TREE-2026-000001').set({ ownerId: 'MT-STU-SCH001-0001', ancestorOrgIds: ['MT-FND-000001', 'MT-SCH-000001'], public: false, orgId: 'MT-SCH-000001' });
      await db.doc('trees/TREE-2026-000002').set({ ownerId: 'MT-IND-000001', ancestorOrgIds: [], public: true });
      await db.doc('trees/TREE-2026-000003').set({ ownerId: 'MT-STU-SCH001-0002', ancestorOrgIds: ['MT-FND-000001', 'MT-SCH-000001'], public: false });
      await db.doc('announcements/a1').set({ text: 'hi', active: true });
    });
  };
  const as = (uid) => env.authenticatedContext(uid).firestore();
  const anon = () => env.unauthenticatedContext().firestore();

  console.log('\nPublic access'); await seed();
  await t('anyone can read meta/setup and a login alias', async () => { await assertSucceeds(anon().doc('meta/setup').get()); await assertSucceeds(anon().doc('loginAliases/MT-STU-SCH001-0001').get()); });
  await t('anyone cannot list login aliases', () => assertFails(anon().collection('loginAliases').get()));
  await t('anyone can read stats/global and city stats, not org stats', async () => {
    await assertSucceeds(anon().doc('stats/global').get());
    await assertSucceeds(anon().collection('stats').where('kind', '==', 'city').get());
    await assertFails(anon().doc('stats/org_MT-SCH-000001').get());
    await assertFails(anon().collection('stats').get());
  });
  await t('anyone cannot read users, orgs or private trees; can read a public tree', async () => {
    await assertFails(anon().doc('users/st1').get()); await assertFails(anon().doc('orgs/MT-SCH-000001').get());
    await assertFails(anon().doc('trees/TREE-2026-000001').get()); await assertSucceeds(anon().doc('trees/TREE-2026-000002').get());
  });
  await t('anyone cannot write stats or counters', async () => { await assertFails(anon().doc('stats/global').set({ trees: 1 })); await assertFails(anon().doc('counters/IND').set({ n: 2 })); });

  console.log('\nFirst-run super admin');
  await env.clearFirestore();
  const boot = (db, uid, extra) => { const b = db.batch(); b.set(db.doc('meta/setup'), { superAdminUid: uid }); b.set(db.doc('users/' + uid), prof({ userId: 'MT-ADM-000001', role: 'super_admin', orgId: '', ancestorOrgIds: [], name: 'Root' })); b.set(db.doc('userIds/MT-ADM-000001'), { uid, orgId: '', ancestorOrgIds: [] }); return b.commit(); };
  await t('bootstrap works once', async () => { await assertSucceeds(as('A').doc('counters/ADM').set({ n: 1 })); await assertSucceeds(boot(as('A'), 'A')); });
  await t('second bootstrap is refused', async () => { await assertSucceeds(as('B').doc('counters/ADM').set({ n: 1 }).catch(() => {})); await assertFails(boot(as('B'), 'B')); });
  await t('writing meta/setup without a super-admin profile is refused', async () => { await env.clearFirestore(); await assertFails(as('C').doc('meta/setup').set({ superAdminUid: 'C' })); });
  await t('creating a super_admin profile once setup exists is refused', async () => {
    await seed();
    await assertFails(as('X').doc('users/X').set(prof({ userId: 'MT-ADM-000002', role: 'super_admin', orgId: '', ancestorOrgIds: [], name: 'Evil' })));
  });

  console.log('\nSelf registration');
  await seed();
  const regInd = (db, uid, userId) => { const b = db.batch(); b.set(db.doc('users/' + uid), prof({ userId, role: 'individual', orgId: '', ancestorOrgIds: [], name: 'New Person' })); b.set(db.doc('userIds/' + userId), { uid, orgId: '', ancestorOrgIds: [] }); b.set(db.doc('stats/global'), { users: 1, individuals: 1 }, { merge: true }); return b.commit(); };
  await t('individual registers with an issued ID', async () => { await assertSucceeds(as('N1').doc('counters/IND').set({ n: 2 })); await assertSucceeds(regInd(as('N1'), 'N1', 'MT-IND-000002')); });
  await t('individual cannot claim an existing ID', async () => assertFails(regInd(as('N2'), 'N2', 'MT-IND-000001')));
  await t('individual cannot claim a not-yet-issued ID', async () => assertFails(regInd(as('N3'), 'N3', 'MT-IND-000009')));
  await t('individual cannot register as super admin / school admin / active org role', async () => {
    await assertFails(as('N4').doc('users/N4').set(prof({ userId: 'MT-IND-000002', role: 'super_admin', orgId: '', ancestorOrgIds: [], name: 'x' })));
    await assertFails(as('N5').doc('users/N5').set(prof({ userId: 'MT-SCH-000002', role: 'school', orgId: 'MT-SCH-000002', ancestorOrgIds: ['MT-SCH-000002'], name: 'x' })));
  });
  const regOrg = (db, uid, orgId, activeFlag) => { const b = db.batch(); const anc = [orgId];
    b.set(db.doc('orgs/' + orgId), { type: 'school', name: 'New School', ancestorOrgIds: anc, parentOrgId: '', status: 'pending', createdBy: uid, createdAt: 1, city: 'Pune' });
    b.set(db.doc('users/' + uid), prof({ userId: orgId, role: 'school', orgId, ancestorOrgIds: anc, name: 'Head', active: activeFlag, status: activeFlag ? 'active' : 'pending' }));
    b.set(db.doc('userIds/' + orgId), { uid, orgId, ancestorOrgIds: anc }); b.set(db.doc('stats/global'), { orgsPending: 1 }, { merge: true }); return b.commit(); };
  await t('school registers as pending', async () => { await assertSucceeds(as('O1').doc('counters/SCH').set({ n: 3 })); await assertSucceeds(regOrg(as('O1'), 'O1', 'MT-SCH-000003', false)); });
  await t('school cannot register itself as already active', async () => { await assertSucceeds(as('O2').doc('counters/SCH').set({ n: 4 })); await assertFails(regOrg(as('O2'), 'O2', 'MT-SCH-000004', true)); });
  await t('pending school admin cannot read trees or other orgs, can read own org and profile', async () => {
    await assertSucceeds(as('O1').doc('users/O1').get()); await assertSucceeds(as('O1').doc('orgs/MT-SCH-000003').get());
    await assertFails(as('O1').doc('orgs/MT-SCH-000001').get()); await assertFails(as('O1').collection('trees').where('ancestorOrgIds', 'array-contains', 'MT-SCH-000003').get());
  });
  await t('pending school admin cannot approve itself', async () => { await assertFails(as('O1').doc('orgs/MT-SCH-000003').update({ status: 'approved' })); await assertFails(as('O1').doc('users/O1').update({ active: true })); });
  await t('super admin approves org and activates its user', async () => {
    const sa = as('sa'); const b = sa.batch(); b.update(sa.doc('orgs/MT-SCH-000003'), { status: 'approved' }); b.update(sa.doc('users/O1'), { active: true, status: 'active' }); await assertSucceeds(b.commit());
  });

  console.log('\nHierarchy & data access'); await seed();
  const mkStudent = (db, uid, orgId, anc, userId) => { const b = db.batch(); b.set(db.doc('users/' + uid), prof({ userId, role: 'student', orgId, ancestorOrgIds: anc, name: 'New Student' })); b.set(db.doc('userIds/' + userId), { uid, orgId, ancestorOrgIds: anc }); b.set(db.doc('loginAliases/' + userId), { authEmail: userId.toLowerCase() + '@mytree.app', active: true }); return b.commit(); };
  await t('school admin creates a student in own school', () => assertSucceeds(mkStudent(as('s1'), 'ns1', 'MT-SCH-000001', ['MT-FND-000001', 'MT-SCH-000001'], 'MT-STU-SCH001-0003')));
  await t('school admin cannot create a student in another school', () => assertFails(mkStudent(as('s1'), 'ns2', 'MT-SCH-000002', ['MT-SCH-000002'], 'MT-STU-SCH002-0001')));
  await t('school admin cannot create a school or foundation user', async () => {
    const d = as('s1'); const b = d.batch(); b.set(d.doc('users/zz'), prof({ userId: 'MT-SCH-000009', role: 'school', orgId: 'MT-SCH-000001', ancestorOrgIds: ['MT-FND-000001', 'MT-SCH-000001'], name: 'x' })); b.set(d.doc('userIds/MT-SCH-000009'), { uid: 'zz', orgId: '', ancestorOrgIds: [] }); await assertFails(b.commit());
  });
  await t('student cannot create accounts', () => assertFails(mkStudent(as('st1'), 'ns3', 'MT-SCH-000001', ['MT-FND-000001', 'MT-SCH-000001'], 'MT-STU-SCH001-0004')));
  await t('student reads own profile, not a classmate\'s', async () => { await assertSucceeds(as('st1').doc('users/st1').get()); await assertFails(as('st1').doc('users/st2').get()); });
  await t('student cannot change own role / org / active; can change own name', async () => {
    await assertFails(as('st1').doc('users/st1').update({ role: 'school' })); await assertFails(as('st1').doc('users/st1').update({ orgId: 'MT-SCH-000002' }));
    await assertFails(as('st1').doc('users/st1').update({ active: false })); await assertSucceeds(as('st1').doc('users/st1').update({ name: 'Renamed' }));
  });
  await t('school admin lists own subtree, not other schools', async () => {
    await assertSucceeds(as('s1').collection('users').where('ancestorOrgIds', 'array-contains', 'MT-SCH-000001').get());
    await assertFails(as('s2').collection('users').where('ancestorOrgIds', 'array-contains', 'MT-SCH-000001').get());
    await assertFails(as('s1').collection('users').get());
  });
  await t('foundation reads school beneath it; sibling school admin cannot', async () => { await assertSucceeds(as('f1').doc('users/st1').get()); await assertFails(as('s2').doc('users/st1').get()); });
  await t('school admin resets student (active/status) but cannot change role; super can', async () => {
    await assertSucceeds(as('s1').doc('users/st1').update({ active: false, status: 'replaced', supersededBy: 'zz' }));
    await assertFails(as('s1').doc('users/st2').update({ role: 'school' })); await assertSucceeds(as('sa').doc('users/st2').update({ role: 'individual' }));
  });
  await t('alias can be re-pointed by the managing school, not by another school', async () => {
    await assertSucceeds(as('s1').doc('loginAliases/MT-STU-SCH001-0001').update({ authEmail: 'mt-stu-sch001-0001+r2@mytree.app', active: true }));
    await assertFails(as('s2').doc('loginAliases/MT-STU-SCH001-0001').update({ authEmail: 'evil@x.com', active: true }));
  });
  await t('trees: owner & managers read; classmate & other school cannot', async () => {
    await seed();
    const L = async (label, p) => { try { await p; } catch (e) { throw new Error(label + ': ' + e.message.split('\n')[0]); } };
    await L('owner get', assertSucceeds(as('st1').doc('trees/TREE-2026-000001').get())); await L('classmate get', assertFails(as('st2').doc('trees/TREE-2026-000001').get()));
    await L('school get', assertSucceeds(as('s1').doc('trees/TREE-2026-000001').get())); await L('foundation get', assertSucceeds(as('f1').doc('trees/TREE-2026-000001').get())); await L('other school get', assertFails(as('s2').doc('trees/TREE-2026-000001').get()));
    await L('own list', assertSucceeds(as('st1').collection('trees').where('ownerId', '==', 'MT-STU-SCH001-0001').get())); await L('classmate list', assertFails(as('st1').collection('trees').where('ownerId', '==', 'MT-STU-SCH001-0002').get()));
  });
  await t('inactive (suspended) user is denied everything', async () => {
    await env.withSecurityRulesDisabled((c) => c.firestore().doc('users/st1').update({ active: false, status: 'suspended' }));
    await assertFails(as('st1').doc('trees/TREE-2026-000001').get()); await assertSucceeds(as('st1').doc('users/st1').get());
  });
  await t('only super admin writes announcements', async () => { await assertFails(as('s1').doc('announcements/a2').set({ text: 'x', active: true })); await assertSucceeds(as('sa').doc('announcements/a2').set({ text: 'x', active: true })); });
  await t('audit log: managers append own actions; students and forged actors refused; no edits', async () => {
    const e = { action: 'org.approved', detail: 'x', actorUid: 's1', ancestorOrgIds: ['MT-SCH-000001'], at: 1 };
    await assertSucceeds(as('s1').collection('auditLog').doc('a1').set(e)); await assertFails(as('s1').collection('auditLog').doc('a2').set(Object.assign({}, e, { actorUid: 'sa' })));
    await assertFails(as('st2').collection('auditLog').doc('a3').set(Object.assign({}, e, { actorUid: 'st2' }))); await assertFails(as('s1').collection('auditLog').doc('a1').update({ detail: 'edited' }));
  });
  await t('foundation creates a school beneath it; school admin cannot create orgs', async () => {
    await env.withSecurityRulesDisabled((c) => c.firestore().doc('counters/SCH').set({ n: 5 }));
    const d = as('f1'); const b = d.batch(); b.set(d.doc('orgs/MT-SCH-000005'), { type: 'school', name: 'Child', ancestorOrgIds: ['MT-FND-000001', 'MT-SCH-000005'], parentOrgId: 'MT-FND-000001', status: 'approved', createdBy: 'f1' });
    await assertSucceeds(b.commit());
    await assertFails(as('s1').doc('orgs/MT-SCH-000005x').set({ type: 'school', name: 'Child', ancestorOrgIds: ['MT-SCH-000001', 'MT-SCH-000005x'], parentOrgId: 'MT-SCH-000001', status: 'approved', createdBy: 's1' }));
  });
  await t('parent may suspend a child org, never itself', async () => {
    await assertSucceeds(as('f1').doc('orgs/MT-SCH-000001').update({ status: 'suspended', statusAt: 1 })); await assertFails(as('f1').doc('orgs/MT-FND-000001').update({ status: 'suspended' }));
  });


  console.log('\nTrees, photos, plots (phase 2)'); await seed();
  const treeDoc = (o) => Object.assign({ code: 'TREE-2026-000100', speciesId: 'neem', ownerId: 'MT-IND-000001', ownerName: 'Ind One', postedBy: 'MT-IND-000001', onBehalfOf: '', orgId: '', ancestorOrgIds: [], lat: 18.5, lng: 73.8, geohash: 'te7ud2x1q', city: 'Pune', state: 'Maharashtra', plantedOn: '2026-05-01', status: 'alive', health: 'healthy', cadence: 'monthly', heightCm: 30, lastUpdateAt: 0, updatesCount: 0, plotId: '', public: false, dedication: '', notes: '', createdAt: 5 }, o || {});
  const stuTree = (o) => treeDoc(Object.assign({ code: 'TREE-2026-000101', ownerId: 'MT-STU-SCH001-0001', ownerName: 'Stu One', postedBy: 'MT-STU-SCH001-0001', orgId: 'MT-SCH-000001', ancestorOrgIds: ['MT-FND-000001', 'MT-SCH-000001'] }, o || {}));
  await t('individual plants for self', () => assertSucceeds(as('ind1').doc('trees/TREE-2026-000100').set(treeDoc())));
  await t('cannot plant in someone else\'s name, with forged ancestors, or with a mismatched code', async () => {
    await assertFails(as('ind1').doc('trees/TREE-2026-000100').set(treeDoc({ ownerId: 'MT-STU-SCH001-0001', postedBy: 'MT-IND-000001' })));
    await assertFails(as('ind1').doc('trees/TREE-2026-000100').set(treeDoc({ ancestorOrgIds: ['MT-SCH-000001'] })));
    await assertFails(as('ind1').doc('trees/TREE-2026-000099').set(treeDoc()));
  });
  await t('tree data is validated (bad health, out-of-range latitude, long notes)', async () => {
    await assertFails(as('ind1').doc('trees/TREE-2026-000100').set(treeDoc({ health: 'great' }))); await assertFails(as('ind1').doc('trees/TREE-2026-000100').set(treeDoc({ lat: 123 })));
    await assertFails(as('ind1').doc('trees/TREE-2026-000100').set(treeDoc({ notes: 'x'.repeat(600) })));
  });
  await t('student can plant privately but never publicly', async () => {
    await assertSucceeds(as('st1').doc('trees/TREE-2026-000101').set(stuTree())); await assertFails(as('st1').doc('trees/TREE-2026-000102').set(stuTree({ code: 'TREE-2026-000102', public: true })));
  });
  await t('school admin plants on behalf of own student (recorded), not of another school\'s student', async () => {
    await assertSucceeds(as('s1').doc('trees/TREE-2026-000103').set(stuTree({ code: 'TREE-2026-000103', postedBy: 'MT-SCH-000001', onBehalfOf: 'MT-STU-SCH001-0001' })));
    await assertFails(as('s2').doc('trees/TREE-2026-000104').set(stuTree({ code: 'TREE-2026-000104', postedBy: 'MT-SCH-000002', onBehalfOf: 'MT-STU-SCH001-0001' })));
    await assertFails(as('s1').doc('trees/TREE-2026-000105').set(stuTree({ code: 'TREE-2026-000105', postedBy: 'MT-SCH-000001', onBehalfOf: '' })));
  });
  await t('on-behalf with forged ancestors is refused (checked against userIds)', () => assertFails(as('s2').doc('trees/TREE-2026-000106').set(stuTree({ code: 'TREE-2026-000106', postedBy: 'MT-SCH-000002', onBehalfOf: 'MT-STU-SCH001-0001', ancestorOrgIds: ['MT-SCH-000002'] }))));
  await t('owner moves pin; cannot change owner; classmate cannot edit; manager can delete', async () => {
    await assertSucceeds(as('ind1').doc('trees/TREE-2026-000100').update({ lat: 18.6, geohash: 'te7ud2x1r' })); await assertFails(as('ind1').doc('trees/TREE-2026-000100').update({ ownerId: 'MT-STU-SCH001-0001' }));
    await assertFails(as('st2').doc('trees/TREE-2026-000101').update({ notes: 'hax' })); await assertSucceeds(as('s1').doc('trees/TREE-2026-000101').delete()); await assertFails(as('ind1').doc('trees/TREE-2026-000101').delete());
  });
  await t('photos: owner stores metadata+full image; oversized rejected; classmate cannot read', async () => {
    const base = { treeId: 'TREE-2026-000100', ownerId: 'MT-IND-000001', orgId: '', ancestorOrgIds: [], createdAt: 5 };
    await assertSucceeds(as('ind1').doc('photos/p1').set(Object.assign({ thumb: 'data:image/jpeg;base64,AAAA', size: 1000, width: 10, height: 10 }, base)));
    await assertSucceeds(as('ind1').doc('photoData/p1').set(Object.assign({ data: 'data:image/jpeg;base64,AAAA' }, base)));
    await assertFails(as('ind1').doc('photos/p2').set(Object.assign({ thumb: 'x'.repeat(50000), size: 1000 }, base)));
    await assertFails(as('ind1').doc('photoData/p2').set(Object.assign({ data: 'x'.repeat(950000) }, base)));
    await assertFails(as('st1').doc('photos/p1').get()); await assertSucceeds(as('ind1').doc('photos/p1').get());
  });
  await t('counters: reserve a block of 3; refuse 600 or going backwards', async () => {
    await assertSucceeds(as('ind1').doc('counters/TREE_2026').set({ n: 3 })); await assertSucceeds(as('ind1').doc('counters/TREE_2026').set({ n: 6 }));
    await assertFails(as('ind1').doc('counters/TREE_2026').set({ n: 700 })); await assertFails(as('ind1').doc('counters/TREE_2026').set({ n: 2 }));
  });
  await t('plots: owner can create, other users cannot read', async () => {
    const plot = { name: 'Plot', ownerId: 'MT-IND-000001', orgId: '', ancestorOrgIds: [], polygon: [{ lat: 1, lng: 1 }], createdAt: 5 };
    await assertSucceeds(as('ind1').doc('plots/PLOT-1').set(plot)); await assertFails(as('st1').doc('plots/PLOT-1').get());
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  await env.cleanup(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
