from __future__ import annotations
from pathlib import Path
import hashlib
import json
import sys
from lib.identity_policy import find_private_identity_violations

try:
    from jsonschema import Draft202012Validator
except Exception as exc:
    print(f"Formal lesson validation requires jsonschema: {exc}", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "docs" / "contracts" / "v0.1.2"
PRESENTATION_SCHEMA = ROOT / "docs" / "capabilities" / "presentation" / "v0.1" / "presentation.schema.json"
SERVER_OWNED_EVENT_PREFIXES = ("session.", "activity.", "stage.", "submission.", "advice.", "controller.", "system.")
def validate_identity_neutral_value(value, label: str, out: list[str], path_label: str = "$") -> None:
    for violation in find_private_identity_violations(value, path_label):
        if violation["kind"] == "field":
            out.append(f"{label}: identity-specific binding field {violation['path']}")
        else:
            out.append(f"{label}: identity-specific binding reference {violation['path']}")


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def errors_for(schema, value, label):
    errors = sorted(Draft202012Validator(schema).iter_errors(value), key=lambda e: list(e.path))
    return [f"{label}: {list(e.path)}: {e.message}" for e in errors]


def safe_ref(base: Path, ref: str) -> Path | None:
    try:
        candidate = (base / ref).resolve()
        candidate.relative_to(base.resolve())
        return candidate
    except Exception:
        return None


def validate_lesson_dir(directory: Path) -> list[str]:
    out: list[str] = []
    base = directory.resolve()
    manifest_path = base / "package.manifest.json"
    if not manifest_path.is_file():
        return ["missing package.manifest.json"]

    schemas = {
        "package": load(CONTRACTS / "24-lesson-package.schema.json"),
        "lesson": load(CONTRACTS / "02-lesson.schema.json"),
        "activity": load(CONTRACTS / "05-activity.schema.json"),
        "applet": load(CONTRACTS / "08-applet-manifest.schema.json"),
        "config": load(CONTRACTS / "08a-applet-config.schema.json"),
    }
    for name, schema in schemas.items():
        try:
            Draft202012Validator.check_schema(schema)
        except Exception as exc:
            out.append(f"contract schema invalid ({name}): {exc}")
            return out

    try:
        manifest = load(manifest_path)
    except Exception as exc:
        return [f"invalid package.manifest.json: {exc}"]
    out += errors_for(schemas["package"], manifest, "package.manifest.json")
    if out:
        return out

    docs = {}
    for key in ["lessonRef", "activitiesRef", "appletManifestsRef", "configsRef"]:
        ref = manifest[key]
        target = safe_ref(base, ref)
        if target is None:
            out.append(f"{key}: path escapes lesson package: {ref}")
            continue
        if not target.is_file():
            out.append(f"{key}: missing referenced file: {ref}")
            continue
        try:
            docs[key] = load(target)
        except Exception as exc:
            out.append(f"{key}: invalid JSON {ref}: {exc}")
    if out:
        return out

    lesson = docs["lessonRef"]
    activities = docs["activitiesRef"]
    manifests = docs["appletManifestsRef"]
    configs = docs["configsRef"]
    out += errors_for(schemas["lesson"], lesson, manifest["lessonRef"])
    if not isinstance(activities, list):
        out.append(f"{manifest['activitiesRef']}: expected array")
    else:
        for i, value in enumerate(activities):
            out += errors_for(schemas["activity"], value, f"activity[{i}]")
    if not isinstance(manifests, list):
        out.append(f"{manifest['appletManifestsRef']}: expected array")
    else:
        for i, value in enumerate(manifests):
            out += errors_for(schemas["applet"], value, f"applet[{i}]")
    if not isinstance(configs, dict):
        out.append(f"{manifest['configsRef']}: expected object keyed by configRef")
    else:
        for key, value in configs.items():
            out += errors_for(schemas["config"], value, f"config[{key}]")

    if out:
        return out

    activity_ids = [a["activityId"] for a in activities]
    if len(activity_ids) != len(set(activity_ids)):
        out.append("duplicate activityId")
    for activity_id in lesson["activities"]:
        if activity_id not in activity_ids:
            out.append(f"lesson references missing activity: {activity_id}")

    manifest_by_type = {m["appletTypeId"]: m for m in manifests}
    if len(manifest_by_type) != len(manifests):
        out.append("duplicate appletTypeId")

    instance_ids: set[str] = set()
    for activity in activities:
        for instance in activity["applets"]:
            instance_id = instance["appletInstanceId"]
            if instance_id in instance_ids:
                out.append(f"duplicate appletInstanceId: {instance_id}")
            instance_ids.add(instance_id)
            applet_type = instance["appletTypeId"]
            applet_manifest = manifest_by_type.get(applet_type)
            if applet_manifest is None:
                out.append(f"{activity['activityId']}/{instance_id}: missing applet manifest {applet_type}")
            else:
                capabilities = set(applet_manifest.get("capabilities", []))
                for capability in instance.get("requiredCapabilities", []):
                    if capability not in capabilities:
                        out.append(f"{activity['activityId']}/{instance_id}: missing capability {capability}")
            config_ref = instance.get("configRef")
            if config_ref:
                cfg = configs.get(config_ref)
                if cfg is None:
                    out.append(f"{activity['activityId']}/{instance_id}: missing config {config_ref}")
                elif cfg.get("appletTypeId") != applet_type:
                    out.append(f"{config_ref}: appletTypeId does not match instance")

    for config_ref, cfg in configs.items():
        if cfg.get("configRef") != config_ref:
            out.append(f"{config_ref}: configRef field must match object key")
        applet = manifest_by_type.get(cfg.get("appletTypeId"))
        if not applet:
            out.append(f"{config_ref}: no applet manifest for {cfg.get('appletTypeId')}")
            continue
        if cfg.get("configSchemaVersion") != applet.get("configSchemaVersion"):
            out.append(f"{config_ref}: configSchemaVersion does not match applet manifest")
        schema_path = safe_ref(base, applet["configSchemaRef"])
        if schema_path is None or not schema_path.is_file():
            out.append(f"{config_ref}: missing config payload schema {applet['configSchemaRef']}")
        else:
            try:
                payload_schema = load(schema_path)
                Draft202012Validator.check_schema(payload_schema)
                out += errors_for(payload_schema, cfg["payload"], f"config-payload[{config_ref}]")
            except Exception as exc:
                out.append(f"{config_ref}: invalid config payload schema: {exc}")

    for applet in manifests:
        for event_type in applet["emittedEventTypes"]:
            if event_type.startswith(SERVER_OWNED_EVENT_PREFIXES):
                out.append(f"{applet['appletTypeId']}: client applet may not declare server-owned event {event_type}")
        if set(applet["emittedEventTypes"]) != set(applet["eventSchemaRefs"].keys()):
            out.append(f"{applet['appletTypeId']}: emittedEventTypes must match eventSchemaRefs keys")
        if set(applet["handledCommandTypes"]) != set(applet["commandSchemaRefs"].keys()):
            out.append(f"{applet['appletTypeId']}: handledCommandTypes must match commandSchemaRefs keys")
        refs = [applet["configSchemaRef"], applet["stateSchemaRef"], *applet["eventSchemaRefs"].values(), *applet["commandSchemaRefs"].values()]
        for ref in refs:
            target = safe_ref(base, ref)
            if target is None or not target.is_file():
                out.append(f"{applet['appletTypeId']}: missing schema ref {ref}")
                continue
            try:
                Draft202012Validator.check_schema(load(target))
            except Exception as exc:
                out.append(f"{applet['appletTypeId']}: invalid schema {ref}: {exc}")

    for asset in lesson["assets"]:
        target = safe_ref(base, asset["path"])
        if target is None:
            out.append(f"asset {asset['assetId']}: path escapes lesson package")
            continue
        if not target.is_file():
            out.append(f"asset {asset['assetId']}: file missing: {asset['path']}")
            continue
        actual_size = target.stat().st_size
        if asset.get("size") is not None and actual_size != asset["size"]:
            out.append(f"asset {asset['assetId']}: size mismatch {actual_size} != {asset['size']}")
        if asset.get("sha256") is not None:
            actual_sha = hashlib.sha256(target.read_bytes()).hexdigest()
            if actual_sha != asset["sha256"]:
                out.append(f"asset {asset['assetId']}: sha256 mismatch")

    presentation_asset = None
    feature_policy = None
    for name, ref in manifest.get("optionalRefs", {}).items():
        target = safe_ref(base, ref)
        if target is None or not target.is_file():
            out.append(f"optionalRef {name}: missing or escaping path {ref}")
            continue
        if name == "workgroups":
            schema = load(CONTRACTS / "13-workgroup.schema.json")
            for i, value in enumerate(load(target)):
                out += errors_for(schema, value, f"workgroup[{i}]")
        elif name in {"featurePolicy", "preflight"}:
            schema = load(CONTRACTS / "14-feature-readiness.schema.json")
            def_name = "featurePolicy" if name == "featurePolicy" else "readiness"
            value = load(target)
            out += errors_for(schema["$defs"][def_name], value, name)
            if name == "featurePolicy":
                feature_policy = value
        elif name == "presentationAsset" and PRESENTATION_SCHEMA.is_file():
            presentation_asset = load(target)
            out += errors_for(load(PRESENTATION_SCHEMA), presentation_asset, "presentationAsset")
            if isinstance(presentation_asset, dict):
                scenes = presentation_asset.get("document", {}).get("scenes", []) if isinstance(presentation_asset.get("document"), dict) else []
                scene_ids = [scene.get("id") for scene in scenes if isinstance(scene, dict) and scene.get("id")]
                if len(scene_ids) != len(set(scene_ids)):
                    out.append("presentationAsset: duplicate scene id")
                binding_ids: set[str] = set()
                for binding in presentation_asset.get("classroomBindings", []):
                    if not isinstance(binding, dict):
                        continue
                    binding_id = binding.get("bindingId")
                    if isinstance(binding_id, str):
                        if binding_id in binding_ids:
                            out.append(f"presentationAsset: duplicate bindingId {binding_id}")
                        binding_ids.add(binding_id)
                    validate_identity_neutral_value(binding, f"presentation binding {binding_id or '?'}", out)

    presentation_activities = [a for a in activities if a.get("stagePolicy", {}).get("contentType") == "presentation:deck"]
    if presentation_activities:
        if presentation_asset is None:
            for activity in presentation_activities:
                out.append(f"{activity['activityId']}: presentation Stage policy requires optionalRefs.presentationAsset")
        else:
            scenes = presentation_asset.get("document", {}).get("scenes", []) if isinstance(presentation_asset.get("document"), dict) else []
            scene_ids = {scene.get("id") for scene in scenes if isinstance(scene, dict) and scene.get("id")}
            for activity in presentation_activities:
                policy = activity.get("stagePolicy", {})
                if policy.get("deckId") != presentation_asset.get("deckId"):
                    out.append(f"{activity['activityId']}: stagePolicy deckId does not match presentation asset")
                scene_id = policy.get("sceneId")
                if scene_id and scene_id not in scene_ids:
                    out.append(f"{activity['activityId']}: unknown presentation scene {scene_id}")
        if feature_policy is None or feature_policy.get("features", {}).get("presentationRuntime") is not True:
            out.append("presentation Stage policy requires presentationRuntime feature=true")

    return out


def main():
    if len(sys.argv) != 2:
        print("Usage: validate-lesson-schema.py <lesson-package-dir>", file=sys.stderr)
        return 2
    directory = Path(sys.argv[1])
    errors = validate_lesson_dir(directory)
    if errors:
        print("Formal lesson package validation FAILED", file=sys.stderr)
        for error in errors:
            print(f" - {error}", file=sys.stderr)
        return 1
    manifest = load(directory / "package.manifest.json")
    print(f"Formal lesson package validation PASSED: {manifest['packageId']}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
