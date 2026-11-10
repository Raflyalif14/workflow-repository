import assert from 'node:assert/strict';
import Module from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setActiveLanguage, translate } from '../i18n';
import type { Project } from '../types/project';

const originalLoad = (Module as any)._load;
let user = { id: 'sales', role: 'SALES' };
let meetingRows:any[]=[];
(Module as any)._load = function (name: string, ...args: any[]) {
  if (name.endsWith('/auth-provider')) return { useAuth: () => ({ user }) };
  if (name.endsWith('/language-provider')) return { useLanguage: () => ({ t: translate,formatDate:(value:string)=>value }) };
  if (name.endsWith('/use-calendar')) return {
    useMeetingMutation: () => ({ isError: false, isPending: false, isSuccess: false }),
    useMeetings: () => ({ data: { items: meetingRows, totalPages: 1 }, isLoading: false, isError: false }),
  };
  return originalLoad.call(this, name, ...args);
};
try {
  const { ProjectMeetings } = require('../components/projects/project-meetings');
  // Mirror the project detail API: pic is nested and pic_id is absent.
  const project: Pick<Project, 'id' | 'sales_id' | 'pic' | 'status' | 'is_postponed'> = {
    id: 'project', sales_id: 'sales', status: 'ACTIVE', is_postponed: false,
    pic: { id: 'sa', fullName: 'Assigned SA', email: 'synthetic@example.invalid' },
  };
  const render = (overrides = {}) => renderToStaticMarkup(React.createElement(ProjectMeetings, { project: { ...project, ...overrides } }));
  for (const locale of ['en', 'id'] as const) {
    setActiveLanguage(locale);
    const hasRequest = (html: string) => html.includes(`>${translate('meetings.request')}</button>`);
    assert(hasRequest(render()), 'Sales owner with nested PIC can request a meeting');
    assert(!render().includes(translate('meetings.picRequired')), 'Assigned PIC is not shown as missing');
    assert(!hasRequest(render({ pic: null })));
    assert(render({ pic: null }).includes(translate('meetings.picRequired')));
    assert(!hasRequest(render({ is_postponed: true })));
    assert(!hasRequest(render({ sales_id: 'another-sales' })));
    assert(!hasRequest(render({ status: 'WON' })));
    user = { id: 'head', role: 'HEAD_SA' }; assert(!hasRequest(render()));
    user = { id: 'sa', role: 'SA' }; assert(!hasRequest(render()));
    user = { id: 'sales', role: 'SALES' };
    meetingRows=Array.from({length:7},(_,i)=>({id:'meeting'+i,projectId:project.id,title:'Meeting '+i,startsAt:'2030-01-02T10:00:00Z',endsAt:null,status:'PENDING',revision:1}));
    const meetingsHtml=render();assert.equal((meetingsHtml.match(/<article/g)||[]).length,4);assert(meetingsHtml.includes(translate('taskPreview.all',{count:7})));assert(!meetingsHtml.includes('overflow-y-auto'));assert(!meetingsHtml.includes('max-h-[32rem]'));meetingRows=[];
  }
  console.log('Meeting request visibility: actual nested PIC DTO, missing PIC, ownership, roles and project state passed in EN/ID.');
} finally {
  (Module as any)._load = originalLoad;
  setActiveLanguage('en');
}
