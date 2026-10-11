import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { describe, expect, it, vi } from 'vitest';
import { buildConceptSearchUrl, buildConceptSourceUrl, deleteProcedure, updateProcedure } from './procedures.resource';

describe('procedure concept sources', () => {
  it('validates coded questions before requesting their answers', () => {
    const source = { uuid: 'procedure-status-uuid', sourceType: 'Answer to' as const };

    expect(buildConceptSourceUrl(source)).toBe(`${restBaseUrl}/concept/procedure-status-uuid?v=custom:(uuid)`);
    expect(buildConceptSearchUrl('', source)).toContain('answerTo=procedure-status-uuid');
  });

  it('validates concept sets before requesting their members', () => {
    const source = { uuid: 'duration-units-uuid', sourceType: 'Concept set' as const };

    expect(buildConceptSourceUrl(source)).toBe(`${restBaseUrl}/concept/duration-units-uuid?v=custom:(uuid)`);
    expect(buildConceptSearchUrl('', source)).toContain('memberOf=duration-units-uuid');
  });

  it('uses the concept class resource when validating class filters', () => {
    expect(buildConceptSourceUrl({ uuid: 'procedure-class-uuid', sourceType: 'Concept class' })).toBe(
      `${restBaseUrl}/conceptclass/procedure-class-uuid?v=custom:(uuid)`,
    );
  });

  it('does not validate unfiltered concept searches', () => {
    expect(buildConceptSourceUrl({ uuid: '', sourceType: 'any' })).toBeNull();
  });
});

it('encodes the complete void reason as a query parameter without changing the path or text', async () => {
  const reason = 'Corrección & revisión? é😀\nMotivo = intacto';
  vi.mocked(openmrsFetch).mockResolvedValue({ status: 200 } as never);
  await deleteProcedure('procedure-uuid', reason);
  const [url, options] = vi.mocked(openmrsFetch).mock.calls[0];
  expect(new URL(url, 'https://example.test').searchParams.get('reason')).toBe(reason);
  expect(url).toContain('/procedure/procedure-uuid?');
  expect(options).toEqual({ method: 'DELETE' });
});

it('updates only submitted procedure fields, preserving patient and encounter ownership', async () => {
  vi.mocked(openmrsFetch).mockResolvedValue({ status: 200 } as never);
  await updateProcedure('procedure-uuid', { notes: 'Updated notes' });
  expect(openmrsFetch).toHaveBeenCalledWith(
    `${restBaseUrl}/procedure/procedure-uuid`,
    expect.objectContaining({ method: 'POST', body: { notes: 'Updated notes' } }),
  );
});
