/**
 * Achievements — 成就系统
 * Gene source: Gaming achievement systems
 * Makes reliability fun and shareable.
 */

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
  progress: number;
  target: number;
}

export const definitions = {
  guardian_bronze: { name: 'Guardian Bronze', icon: '🛡', description: 'Intercept 10 duplicate calls', target: 10 },
  guardian_silver: { name: 'Guardian Silver', icon: '🛡', description: 'Intercept 100 duplicate calls', target: 100 },
  guardian_gold:   { name: 'Guardian Gold', icon: '🛡', description: 'Intercept 1000 duplicate calls', target: 1000 },
  survivor_bronze: { name: 'Survivor Bronze', icon: '⚡', description: 'Recover from 3 circuit breaks', target: 3 },
  survivor_silver: { name: 'Survivor Silver', icon: '⚡', description: 'Recover from 10 circuit breaks', target: 10 },
  inspector_bronze: { name: 'Inspector Bronze', icon: '🔧', description: '99%+ validation pass rate over 100 checks', target: 100 },
  watcher_bronze:  { name: 'Watcher Bronze', icon: '👁', description: 'Trace 1000 spans', target: 1000 },
  ark_master:      { name: 'ARK Master', icon: '🎖', description: 'Unlock all other achievements', target: 7 },
};

export class Achievements {
  private achievements: Map<string, Achievement> = new Map();

  constructor() {
    for (const [id, def] of Object.entries(definitions)) {
      this.achievements.set(id, {
        id,
        name: def.name,
        icon: def.icon,
        description: def.description,
        unlocked: false,
        progress: 0,
        target: def.target,
      });
    }
  }

  /** Update progress for an achievement */
  update(id: string, progress: number): boolean {
    const a = this.achievements.get(id);
    if (!a) return false;
    a.progress = Math.max(a.progress, progress);
    if (a.progress >= a.target && !a.unlocked) {
      a.unlocked = true;
      this.checkArkMaster();
      return true; // newly unlocked
    }
    return false;
  }

  private checkArkMaster(): void {
    const master = this.achievements.get('ark_master');
    if (!master || master.unlocked) return;
    const others = [...this.achievements.values()].filter((a) => a.id !== 'ark_master');
    if (others.every((a) => a.unlocked)) {
      master.unlocked = true;
      master.progress = master.target;
    }
  }

  get list(): Achievement[] {
    return [...this.achievements.values()];
  }

  get unlocked(): Achievement[] {
    return this.list.filter((a) => a.unlocked);
  }

  get summary(): Record<string, { name: string; icon: string; unlocked: boolean; progress: string }> {
    const result: Record<string, any> = {};
    for (const a of this.list) {
      result[a.id] = {
        name: a.name,
        icon: a.icon,
        unlocked: a.unlocked,
        progress: `${a.progress}/${a.target}`,
      };
    }
    return result;
  }
}
