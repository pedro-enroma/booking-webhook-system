import axios from 'axios';

interface CronExecution {
  id: string;
  start: Date;
  end?: Date;
  success?: boolean;
  duration?: number;
  itemsProcessed?: number;
  isRunning: boolean;
  ageMinutes: number;
}

interface CronStatus {
  executions: CronExecution[];
  summary: {
    total: number;
    running: number;
    failed: number;
    lastRun: CronExecution;
  };
}

async function monitor() {
  const res = await axios.get<CronStatus>('http://localhost:3000/cron-status');
  const { summary, executions } = res.data;
  
  console.clear();
  console.log(`⏰ CRON MONITOR - ${new Date().toLocaleString()}`);
  console.log(`Running: ${summary.running} | Failed: ${summary.failed} | Total: ${summary.total}`);
  
  executions.slice(0, 5).forEach(e => {
    const status = e.isRunning ? '🔄' : e.success ? '✅' : '❌';
    console.log(`${status} ${e.id} - ${e.itemsProcessed || 0} items in ${e.duration || 0}s`);
  });
}

setInterval(monitor, 5000);
monitor();