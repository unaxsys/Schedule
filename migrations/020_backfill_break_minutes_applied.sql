ALTER TABLE IF EXISTS schedule_entries
  ADD COLUMN IF NOT EXISTS break_minutes_applied INTEGER NULL;

UPDATE schedule_entries se
SET break_minutes_applied = COALESCE(
  (
    SELECT CASE
      WHEN COALESCE(st.break_included, FALSE) THEN 0
      ELSE LEAST(
        GREATEST(COALESCE(st.break_minutes, 0), 0),
        CASE
          WHEN st.start_time = st.end_time THEN 0
          WHEN st.end_time > st.start_time THEN
            ((split_part(st.end_time, ':', 1)::int * 60 + split_part(st.end_time, ':', 2)::int)
             - (split_part(st.start_time, ':', 1)::int * 60 + split_part(st.start_time, ':', 2)::int))
          ELSE
            (1440 - (split_part(st.start_time, ':', 1)::int * 60 + split_part(st.start_time, ':', 2)::int)
             + (split_part(st.end_time, ':', 1)::int * 60 + split_part(st.end_time, ':', 2)::int))
        END
      )
    END
    FROM schedules s
    LEFT JOIN LATERAL (
      SELECT st.break_minutes, st.break_included, st.start_time, st.end_time
      FROM shift_templates st
      WHERE st.code = se.shift_code
        AND (st.tenant_id IS NULL OR st.tenant_id = s.tenant_id)
        AND (st.department_id IS NULL OR st.department_id = s.department_id)
      ORDER BY CASE WHEN st.department_id = s.department_id THEN 0 ELSE 1 END,
               CASE WHEN st.tenant_id = s.tenant_id THEN 0 ELSE 1 END
      LIMIT 1
    ) st ON TRUE
    WHERE s.id = se.schedule_id
  ),
  0
)
WHERE se.break_minutes_applied IS NULL;
