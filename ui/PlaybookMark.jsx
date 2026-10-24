import React from 'react';
import source from '../assets/playbook-mark.svg?raw';

const markup = source.slice(source.indexOf('>') + 1, source.lastIndexOf('</svg>'));

export default function PlaybookMark({ size = 24, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" data-playbook-mark="" {...props} dangerouslySetInnerHTML={{ __html: markup }} />;
}
