import { useEffect, useState } from 'react';

interface Device {
  id: string;
  type: string;
  name: string;
}

interface Rule {
  id: string;
  name: string;
  trigger: string;
  action: string;
}

function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);

  useEffect(() => {
    fetch('http://localhost:4000/api/devices')
      .then((response) => response.json())
      .then(setDevices)
      .catch(console.error);

    fetch('http://localhost:4000/api/rules')
      .then((response) => response.json())
      .then(setRules)
      .catch(console.error);
  }, []);

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>PACS Security Dashboard</h1>
      <section>
        <h2>Devices</h2>
        <ul>
          {devices.map((device) => (
            <li key={device.id}>{device.name} ({device.type})</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Rules</h2>
        <ul>
          {rules.map((rule) => (
            <li key={rule.id}>{rule.name}: {rule.trigger} → {rule.action}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default App;
