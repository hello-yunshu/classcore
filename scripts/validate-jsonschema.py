from pathlib import Path
import json, sys
try:
    from jsonschema import Draft202012Validator
except Exception as e:
    print('Formal validation requires Python package jsonschema:', e, file=sys.stderr); sys.exit(2)
root=Path(__file__).resolve().parents[1]; c=root/'docs/contracts/v0.1.2'; ex=root/'examples/pattern-restoration'
def load(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def check_schema(name):
    s=load(c/name); Draft202012Validator.check_schema(s); return s
def validate(schema,value,label):
    errs=sorted(Draft202012Validator(schema).iter_errors(value), key=lambda e:list(e.path))
    if errs:
        for e in errs: print(f'{label}: {list(e.path)}: {e.message}',file=sys.stderr)
        return False
    return True
def validate_def(file,def_name,value,label):
    s=check_schema(file); return validate(s.get('$defs',{}).get(def_name,s),value,label)
ok=True
pkg=load(ex/'package.manifest.json'); ok &= validate(check_schema('24-lesson-package.schema.json'),pkg,'package')
lesson=load(ex/pkg['lessonRef']); ok &= validate(check_schema('02-lesson.schema.json'),lesson,'lesson')
ok &= validate(check_schema('03-session.schema.json'),load(ex/'session.example.json'),'session')
act_schema=check_schema('05-activity.schema.json')
for i,v in enumerate(load(ex/pkg['activitiesRef'])): ok &= validate(act_schema,v,f'activity[{i}]')
app_schema=check_schema('08-applet-manifest.schema.json')
manifests=load(ex/pkg['appletManifestsRef'])
for i,v in enumerate(manifests):
    ok &= validate(app_schema,v,f'applet[{i}]')
    for ref in [v['configSchemaRef'],v['stateSchemaRef'],*v['eventSchemaRefs'].values(),*v['commandSchemaRefs'].values()]:
        schema_path=ex/ref
        if not schema_path.exists():
            print(f'applet[{i}]: missing schema ref {ref}',file=sys.stderr); ok=False
        else:
            Draft202012Validator.check_schema(load(schema_path))
cfg_schema=check_schema('08a-applet-config.schema.json')
configs=load(ex/pkg['configsRef'])
for k,v in configs.items():
    ok &= validate(cfg_schema,v,f'config[{k}]')
    m=next((m for m in manifests if m['appletTypeId']==v['appletTypeId']),None)
    if m:
        ok &= validate(load(ex/m['configSchemaRef']),v['payload'],f'config-payload[{k}]')
optional=pkg.get('optionalRefs',{})
if 'workgroups' in optional:
    w=check_schema('13-workgroup.schema.json')
    for i,v in enumerate(load(ex/optional['workgroups'])): ok &= validate(w,v,f'workgroup[{i}]')
if 'featurePolicy' in optional: ok &= validate_def('14-feature-readiness.schema.json','featurePolicy',load(ex/optional['featurePolicy']),'featurePolicy')
if 'preflight' in optional: ok &= validate_def('14-feature-readiness.schema.json','readiness',load(ex/optional['preflight']),'preflight')
ok &= validate_def('14-feature-readiness.schema.json','clientReadiness',load(ex/'client-readiness.example.json'),'clientReadiness')
if 'presentationAsset' in optional:
    ps=load(root/'docs/capabilities/presentation/v0.1/presentation.schema.json')
    Draft202012Validator.check_schema(ps)
    ok &= validate(ps,load(ex/optional['presentationAsset']),'presentationAsset')
join=load(ex/'join-flow.example.json')
for key in ['joinRequest','membership','joinGrant']: ok &= validate_def('04-participant-connection.schema.json',key,join[key],f'join.{key}')
ok &= validate_def('23-protocol-handshake.schema.json','clientHello',join['clientHello'],'join.clientHello')
ok &= validate_def('23-protocol-handshake.schema.json','serverHello',join['serverHello'],'join.serverHello')
live=load(ex/'live-subscription.example.json')
ok &= validate_def('25-live-subscription.schema.json','request',live['request'],'live.request')
ok &= validate_def('25-live-subscription.schema.json','grant',live['grant'],'live.grant')
for p in c.glob('*.schema.json'): check_schema(p.name)
for p in (root/'docs/capabilities/presentation/v0.1').glob('*.schema.json'): Draft202012Validator.check_schema(load(p))

# Negative contract assertions: known-invalid shapes must be rejected.
def must_reject(schema,value,label):
    errs=list(Draft202012Validator(schema).iter_errors(value))
    if not errs:
        print(f'{label}: invalid sample was unexpectedly accepted',file=sys.stderr)
        return False
    return True
bad_lesson=json.loads(json.dumps(lesson)); bad_lesson['assets'][0].pop('sha256',None)
ok &= must_reject(check_schema('02-lesson.schema.json'),bad_lesson,'negative.preload-without-hash')
bad_command={'commandId':'command:bad','runtimeApiVersion':1,'sessionId':'session:forged','type':'session.start','payload':{}}
ok &= must_reject(check_schema('06-command.schema.json'),bad_command,'negative.client-command-session-spoof')
snapshot_schema=check_schema('09-applet-state.schema.json')['$defs']['snapshot']
bad_snapshot={'sessionId':'session:A','activityId':'activity:A','appletInstanceId':'applet-instance:X','scope':{'type':'participant','id':'student:S17'},'stateSchemaVersion':1,'revision':0,'state':{}}
ok &= must_reject(snapshot_schema,bad_snapshot,'negative.snapshot-without-capturedAt')
bad_join=json.loads(json.dumps(join['joinGrant'])); bad_join['publicSubjectId']='anon:01'
ok &= must_reject(check_schema('04-participant-connection.schema.json')['$defs']['joinGrant'],bad_join,'negative.join-grant-subject-leak')
bad_pkg=json.loads(json.dumps(pkg)); bad_pkg.pop('runtimeApiVersion',None)
ok &= must_reject(check_schema('24-lesson-package.schema.json'),bad_pkg,'negative.package-without-runtime-version')
identity=check_schema('04-participant-connection.schema.json')['$defs']
bad_teacher_join={'joinRequestId':'j','runtimeApiVersion':1,'sessionLocator':'s','requestedRole':'teacher','credential':{'type':'class-code','value':'123'}}
ok &= must_reject(identity['joinRequest'],bad_teacher_join,'negative.class-code-role-escalation')
bad_system_grant={'membershipId':'m','sessionId':'s','participantId':'system:x','role':'system','accessToken':'t','expiresAt':'x'}
ok &= must_reject(identity['joinGrant'],bad_system_grant,'negative.system-join-grant')
protocol=check_schema('22-protocol-result.schema.json')['$defs']
ok &= must_reject(protocol['eventAck'],{'clientEventId':'x','accepted':False,'duplicate':False},'negative.rejected-ack-without-error')
ok &= must_reject(protocol['commandResult'],{'commandId':'x','ok':False},'negative.failed-command-without-error')
wg=check_schema('13-workgroup.schema.json')
ok &= must_reject(wg,{'workgroupId':'w','sessionId':'s','activityId':'a','type':'pair','memberIds':['s1','s2','s3'],'status':'active'},'negative.pair-with-three-members')
bad_session=json.loads(json.dumps(load(ex/'session.example.json'))); bad_session['featurePolicy']={}
ok &= must_reject(check_schema('03-session.schema.json'),bad_session,'negative.empty-feature-policy')
if 'presentationAsset' in optional:
    ps=load(root/'docs/capabilities/presentation/v0.1/presentation.schema.json')
    bad_presentation=json.loads(json.dumps(load(ex/optional['presentationAsset'])))
    bad_presentation['classroomBindings'][0]['source']['ref']='student:S17'
    ok &= must_reject(ps,bad_presentation,'negative.presentation-raw-student-ref')

# CR2 projection examples.
projection_examples=load(ex/'projections.example.json')
projection_defs=check_schema('40-surface-projection.schema.json')['$defs']
ok &= validate(projection_defs['teacherStudentProjection'],projection_examples['teacher'],'projection.teacher')
ok &= validate(projection_defs['studentSelfProjection'],projection_examples['studentSelf'],'projection.studentSelf')
ok &= validate(projection_defs['publicStudentProjection'],projection_examples['observer'],'projection.observer')
ok &= validate(projection_defs['publicStudentProjection'],projection_examples['display'],'projection.display')
ok &= validate(projection_defs['backstageStudentProjection'],projection_examples['backstage'],'projection.backstage')

# CR2 identity/surface negative assertions.
participant_schema=check_schema('04-participant-connection.schema.json')['$defs']['participant']
ok &= must_reject(participant_schema,{'participantId':'student:S17','role':'student','displayName':'学生甲'},'negative.participant-public-displayName')
ok &= must_reject(participant_schema,{'participantId':'system:server','role':'system'},'negative.system-is-not-participant')
projection=check_schema('40-surface-projection.schema.json')['$defs']
ok &= validate(projection['publicStudentProjection'],{'subjectId':'anon:07','label':'学生07'},'projection.public.valid')
ok &= must_reject(projection['publicStudentProjection'],{'subjectId':'anon:07','label':'学生07','participantId':'student:S17'},'negative.public-projection-participantId')
ok &= must_reject(projection['publicStudentProjection'],{'subjectId':'anon:07','label':'学生07','displayName':'学生甲'},'negative.public-projection-displayName')

# Prove an actual Applet payload schema rejects malformed semantic data.
tb=next((m for m in manifests if m['appletTypeId']=='applet:transform-board'),None)
if tb:
    rot_schema=load(ex/tb['eventSchemaRefs']['object.rotated'])
    ok &= validate(rot_schema,{'objectId':'fragment:B','centerId':'P','direction':'clockwise','angle':90},'event.object.rotated.valid')
    ok &= must_reject(rot_schema,{'garbage':True},'negative.event.object.rotated.payload')

print('Formal Draft 2020-12 validation PASSED' if ok else 'Formal validation FAILED')
sys.exit(0 if ok else 1)
