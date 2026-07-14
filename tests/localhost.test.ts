import { describe, it, expect, beforeEach } from 'vitest';
import { localhostPort, projectFor, buildPortMap, suggestProjectName } from '@/shared/localhost';
import { FakeChrome } from './fake-chrome';
import { PortMappingStore } from '@/core/background/settings';

describe('localhostPort', () => {
  it('识别本地地址并取端口', () => {
    expect(localhostPort('http://localhost:3000/x')).toBe(3000);
    expect(localhostPort('http://127.0.0.1:5173/')).toBe(5173);
    expect(localhostPort('https://localhost/x')).toBe(443);
    expect(localhostPort('http://localhost/x')).toBe(80);
  });
  it('非本地地址返回 null', () => {
    expect(localhostPort('https://github.com/a')).toBeNull();
    expect(localhostPort('not a url')).toBeNull();
  });
});

describe('projectFor / buildPortMap', () => {
  it('按端口映射查项目名', () => {
    const map = buildPortMap([
      { port: 3000, project: 'auth-service' },
      { port: 5173, project: 'wraith-ui' },
    ]);
    expect(projectFor('http://localhost:3000/login', map)).toBe('auth-service');
    expect(projectFor('http://localhost:9999/', map)).toBeNull();
    expect(projectFor('https://github.com', map)).toBeNull();
  });
});

describe('suggestProjectName', () => {
  it('去掉 host:port 噪声、截断', () => {
    expect(suggestProjectName('localhost:3000 · Dashboard', 3000)).toBe('Dashboard');
    expect(suggestProjectName('', 3000)).toBe('localhost-3000');
    expect(suggestProjectName('x'.repeat(30), 3000)).toHaveLength(20);
  });
});

describe('PortMappingStore', () => {
  beforeEach(() => new FakeChrome().install());

  it('set/remove/持久化,按端口排序去重', async () => {
    const store = new PortMappingStore();
    await store.load();
    await store.set(5173, 'wraith-ui');
    await store.set(3000, 'auth-service');
    await store.set(3000, 'auth'); // 覆盖同端口
    expect(store.get()).toEqual([
      { port: 3000, project: 'auth' },
      { port: 5173, project: 'wraith-ui' },
    ]);

    // 新实例从存储恢复
    const store2 = new PortMappingStore();
    await store2.load();
    expect(store2.get()).toHaveLength(2);

    await store.remove(3000);
    expect(store.get()).toEqual([{ port: 5173, project: 'wraith-ui' }]);
  });

  it('空项目名不写入', async () => {
    const store = new PortMappingStore();
    await store.load();
    await store.set(3000, '   ');
    expect(store.get()).toEqual([]);
  });
});
