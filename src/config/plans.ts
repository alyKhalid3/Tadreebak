export interface IPlan {
    id: string
    name: string
    credits: number
    priceCents: number
    description: string
}

export const PLANS: IPlan[] = [
    { id: 'starter', name: 'Starter', credits: 5, priceCents: 50000, description: '5 additional internship posts' },
    { id: 'growth', name: 'Growth', credits: 15, priceCents: 120000, description: '15 additional internship posts' },
    { id: 'enterprise', name: 'Enterprise', credits: 50, priceCents: 300000, description: '50 additional internship posts' },
]

export const getPlanById = (id: string): IPlan | undefined => PLANS.find(p => p.id === id)
