const fs = require('fs');

const data = JSON.parse(fs.readFileSync('fallow_dupes_utf8.json', 'utf8'));
const groups = data.clone_groups;

// Create a graph where nodes are groups, and an edge exists if they share a file
const groupFiles = groups.map((g, idx) => ({
  id: idx,
  files: new Set(g.instances.map(inst => inst.file)),
  group: g
}));

const adjacency = Array.from({ length: groups.length }, () => []);
for (let i = 0; i < groups.length; i++) {
  for (let j = i + 1; j < groups.length; j++) {
    const filesI = groupFiles[i].files;
    const filesJ = groupFiles[j].files;
    let intersect = false;
    for (const f of filesI) {
      if (filesJ.has(f)) {
        intersect = true;
        break;
      }
    }
    if (intersect) {
      adjacency[i].push(j);
      adjacency[j].push(i);
    }
  }
}

// Find connected components
const visited = new Set();
const components = [];

for (let i = 0; i < groups.length; i++) {
  if (!visited.has(i)) {
    const comp = [];
    const queue = [i];
    visited.add(i);
    
    while (queue.length > 0) {
      const curr = queue.shift();
      comp.push(curr);
      for (const neighbor of adjacency[curr]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(comp);
  }
}

// Write the partitions out
const partitions = components.map(comp => comp.map(idx => groups[idx]));

console.log(`Found ${partitions.length} independent partitions.`);
partitions.forEach((p, i) => {
  fs.writeFileSync(`partition_${i}.json`, JSON.stringify(p, null, 2));
});
