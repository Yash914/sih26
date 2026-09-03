import './role-ui.jsx';

const renameProject = () => {
  document.title = 'SAHARA — Distress Monitoring';
  const root = document.getElementById('root');
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  nodes.forEach(textNode => {
    if (textNode.nodeValue.includes('MindWatch')) {
      textNode.nodeValue = textNode.nodeValue.replaceAll('MindWatch', 'SAHARA');
    }
  });
};

renameProject();
const observer = new MutationObserver(renameProject);
observer.observe(document.getElementById('root'), { childList: true, subtree: true, characterData: true });
