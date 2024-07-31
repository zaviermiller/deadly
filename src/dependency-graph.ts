import fs from 'fs';
import path from 'path';

export default class DependencyGraph {
  dependencies: Map<string, Set<string>>;
  dependents: Map<string, Set<string>>;

  constructor() {
    this.dependencies = new Map<string, Set<string>>();
    this.dependents = new Map<string, Set<string>>();
  }

  static load(filePath: string): DependencyGraph {
    const data = fs.readFileSync(filePath, 'utf-8');
    const d = JSON.parse(data);
    const graph = new DependencyGraph();

    for (const [node, edges] of d.nodes) {
      const fullNodePath = d.projectDir + node;
      graph.dependencies.set(fullNodePath, new Set());
      graph.dependents.set(fullNodePath, new Set());
    }

    for (const [node, edges] of d.nodes) {
      for (const edge of edges) {
        graph.addEdge(d.projectDir + node, d.projectDir + d.nodes[edge][0]);
      }
    }

    return graph;
  }

  addNode(filePath: string) {
    if (!this.dependencies.has(filePath)) {
      this.dependencies.set(filePath, new Set());
    }
    if (!this.dependents.has(filePath)) {
      this.dependents.set(filePath, new Set());
    }
  }

  addEdge(from: string, to: string) {
    this.addNode(from);
    this.addNode(to);
    this.dependencies.get(from)?.add(to);
    this.dependents.get(to)?.add(from);
  }

  hasPathToEntryPoint(
    start: string,
    end: string,
    visited: Set<string> = new Set()
  ): boolean {
    if (start === end) return true;
    visited.add(start);

    const neighbors = this.dependents.get(start) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (this.hasPathToEntryPoint(neighbor, end, visited)) {
          return true;
        }
      }
    }

    return false;
  }

  getDependencies(filePath: string): Set<string> {
    filePath = path.resolve(filePath);
    return this.dependencies.get(filePath) || new Set();
  }

  getDependents(filePath: string): Set<string> {
    filePath = path.resolve(filePath);
    return this.dependents.get(filePath) || new Set();
  }

  save(filePath: string, projectDir: string = '') {
    projectDir = path.resolve(projectDir);
    const nodesArr = [...this.dependencies];
    const data: { projectDir: string; nodes: any[] } = {
      projectDir,
      nodes: nodesArr.map(([node, edges]) => [
        node.replace(projectDir, ''),
        [...edges].map((edge) => edge.replace(projectDir, '')),
      ]),
    };
    data.nodes = data.nodes.map(([node, edges]) => [
      node,
      [...edges].map((edge) => data.nodes.findIndex(([n, _]) => n === edge)),
    ]);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
}
