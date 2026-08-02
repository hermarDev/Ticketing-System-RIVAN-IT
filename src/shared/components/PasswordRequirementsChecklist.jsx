import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { getPasswordRequirementStatus } from '../../lib/formValidation'

/**
 * Live password policy checklist for signup / recovery / staff forms.
 * @param {{ password: string, listId?: string }} props
 */
export function PasswordRequirementsChecklist({ password, listId = 'password-requirements' }) {
  const requirements = useMemo(
    () => getPasswordRequirementStatus(password),
    [password]
  )

  if (!password) return null

  return (
    <ul
      id={listId}
      className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-3"
      aria-label="Password requirements"
    >
      {requirements.map((requirement) => (
        <li
          key={requirement.id}
          aria-label={`${requirement.label}: ${requirement.met ? 'met' : 'not met'}`}
          className={`flex items-center gap-1.5 text-[11px] font-semibold ${
            requirement.met
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Check
            size={12}
            className={requirement.met ? 'opacity-100' : 'opacity-35'}
            aria-hidden="true"
          />
          <span>{requirement.label}</span>
        </li>
      ))}
    </ul>
  )
}
