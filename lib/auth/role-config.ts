import { ShieldAlert, ShieldCheck, GraduationCap, Users } from 'lucide-react'

export type LoginRole = 'owner' | 'admin' | 'teacher' | 'parent' | 'universal'

export interface RolePresentation {
  id: LoginRole
  title: string
  subtitle: string
  description: string
  Icon: React.ElementType
  colorClass: string
}

export const ROLE_CONFIGS: Record<LoginRole, RolePresentation> = {
  universal: {
    id: 'universal',
    title: 'ចូលគណនីប្រព័ន្ធ',
    subtitle: 'ប្រព័ន្ធជំនួយការគ្រូបង្រៀនឌីជីថល KruSmart',
    description: 'សូមបញ្ចូលអុីមែល និងពាក្យសម្ងាត់របស់អ្នកដើម្បីបន្ត។',
    Icon: Users,
    colorClass: 'text-brand dark:text-brand-400',
  },
  owner: {
    id: 'owner',
    title: 'ចូលគណនី ម្ចាស់សាលា',
    subtitle: 'គ្រប់គ្រងប្រព័ន្ធ និងការកំណត់ទូទៅ',
    description: 'ចូលគណនីដើម្បីគ្រប់គ្រងទិន្នន័យសាលា ការកំណត់សិទ្ធិ និងរបាយការណ៍រួម។',
    Icon: ShieldAlert,
    colorClass: 'text-purple-600 dark:text-purple-400',
  },
  admin: {
    id: 'admin',
    title: 'ចូលគណនី អ្នកគ្រប់គ្រង',
    subtitle: 'ប្រតិបត្តិការសាលារៀនប្រចាំថ្ងៃ',
    description: 'ចូលគណនីដើម្បីគ្រប់គ្រងបុគ្គលិក សិស្ស ថ្នាក់រៀន និងរបាយការណ៍សាលា។',
    Icon: ShieldCheck,
    colorClass: 'text-brand dark:text-brand-400',
  },
  teacher: {
    id: 'teacher',
    title: 'ចូលគណនី គ្រូបង្រៀន',
    subtitle: 'គ្រប់គ្រងថ្នាក់រៀន និងពិន្ទុសិស្ស',
    description: 'ចូលគណនីដើម្បីស្រង់វត្តមាន ដាក់ពិន្ទុ កិច្ចការផ្ទះ និងវាយតម្លៃសិស្ស។',
    Icon: GraduationCap,
    colorClass: 'text-blue-600 dark:text-blue-400',
  },
  parent: {
    id: 'parent',
    title: 'ចូលគណនី អាណាព្យាបាល',
    subtitle: 'តាមដានការសិក្សារបស់កូន',
    description: 'មានតែគណនីដែលសាលាបានភ្ជាប់ជាមួយសិស្សប៉ុណ្ណោះ ទើបអាចចូលមើលព័ត៌មានបាន។',
    Icon: Users,
    colorClass: 'text-emerald-600 dark:text-emerald-400',
  }
}
