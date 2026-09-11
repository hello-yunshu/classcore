import type { ReadinessCheck } from '@classroom/contracts';
import { validateStudentIdentityRoster, type StudentIdentityRecord } from '@classroom/server-identity';
/** Backstage调用的Server-side Preflight；名单真实身份不进入浏览器核心包。 */
export function buildRosterReadinessChecks(records: StudentIdentityRecord[]): ReadinessCheck[] {
    const issues = validateStudentIdentityRoster(records);
    if (issues.length === 0)
        return [{ checkId: 'roster-identity-uniqueness', status: 'ready', message: '学生名单编号与roster标识唯一' }];
    return issues.map((issue, index) => ({
        checkId: `roster-identity-uniqueness:${index + 1}`, status: 'failed',
        message: issue.code === 'duplicate-seat-no' ? `座位号/学号 ${issue.value} 重复` : issue.code === 'duplicate-roster-id' ? `rosterId ${issue.value} 重复` : issue.code === 'ambiguous-participant-hint' ? `登录提示 ${issue.value} 同时匹配多个学生` : `participantId ${issue.value} 重复`,
        details: { value: issue.value, participantIds: issue.participantIds },
    }));
}

