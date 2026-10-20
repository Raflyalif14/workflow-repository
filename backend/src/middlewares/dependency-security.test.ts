import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Resolve the same copies used by Express and the login rate limiter.
const expressRequire = createRequire(require.resolve('express'));
const limiterRequire = createRequire(require.resolve('express-rate-limit'));
type ProxyRequest = {
  socket: { remoteAddress: string };
  headers: { 'x-forwarded-for': string };
};
type ProxyAddress = {
  (request: ProxyRequest, trust: (ip: string) => boolean): string;
  compile(subnet: string): (ip: string) => boolean;
};
const proxyAddress = expressRequire('proxy-addr') as ProxyAddress;
const { Address4, Address6 } = limiterRequire('ip-address') as typeof import('ip-address');

function testForwardedIpCannotBypassProxyBoundary() {
  for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
    const trust = proxyAddress.compile(subnet);
    for (const remoteAddress of ['203.0.113.8', '::ffff:203.0.113.8']) {
      assert.equal(trust(remoteAddress), false, `${subnet} must not trust an unrelated IPv4 client`);
      const request = { socket: { remoteAddress }, headers: { 'x-forwarded-for': '10.0.0.5' } };
      assert.equal(proxyAddress(request, trust), remoteAddress, 'An untrusted client cannot choose its effective IP');
    }
  }

  for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
    const request = { socket: { remoteAddress: '10.0.0.8' }, headers: { 'x-forwarded-for': '192.0.2.25' } };
    assert.equal(proxyAddress(request, proxyAddress.compile(subnet)), '192.0.2.25', 'A correctly configured proxy still works');
  }
}

function testAddressFamiliesStaySeparate() {
  const ipv4Subnet = new Address4('10.0.0.0/8');
  const ipv6Subnet = new Address6('2000::/3');
  assert.equal(new Address6('a00::1').isInSubnet(ipv4Subnet), false);
  assert.equal(new Address6('a00::1').isHostInSubnet(ipv4Subnet), false);
  assert.equal(new Address4('32.0.0.1').isInSubnet(ipv6Subnet), false);
  assert.equal(new Address4('10.0.0.8').isInSubnet(ipv4Subnet), true);
  assert.equal(new Address6('2001:db8::1').isInSubnet(new Address6('2001:db8::/32')), true);
}

testForwardedIpCannotBypassProxyBoundary();
testAddressFamiliesStaySeparate();
console.log('Dependency security: forwarded IP spoofing is rejected; valid proxies and address-family checks pass.');
