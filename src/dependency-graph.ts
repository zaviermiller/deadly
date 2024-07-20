import fs from 'fs';
import path from 'path';

type DependencyGraphNode = Set<string>;

export default class DependencyGraph {
  nodes: Map<string, DependencyGraphNode>;

  constructor() {
    this.nodes = new Map<string, DependencyGraphNode>();
  }

  static load(filePath: string): DependencyGraph {
    const data = fs.readFileSync(filePath, 'utf-8');
    const d = JSON.parse(data);
    const graph = new DependencyGraph();
    for (const [node, _] of d.nodes) {
      graph.nodes.set(d.projectDir + node, new Set());
    }

    for (const [node, edges] of d.nodes) {
      for (const edge of edges) {
        graph.addEdge(d.projectDir + node, d.projectDir + d.nodes[edge][0]);
      }
    }

    return graph;
  }

  addNode(filePath: string) {
    if (!this.nodes.has(filePath)) {
      this.nodes.set(filePath, new Set());
    }
  }

  addEdge(from: string, to: string) {
    this.addNode(from);
    this.addNode(to);
    this.nodes.get(from)?.add(to);
    this.nodes.get(to)?.add(from);
  }

  hasPathToEntryPoint(
    start: string,
    end: string,
    visited: Set<string> = new Set()
  ): boolean {
    if (start === end) return true;
    visited.add(start);

    const neighbors = this.nodes.get(start) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (this.hasPathToEntryPoint(neighbor, end, visited)) {
          return true;
        }
      }
    }

    return false;
  }

  getDependencies(filePath: string): DependencyGraphNode {
    filePath = path.resolve(filePath);
    return this.nodes.get(filePath) || new Set();
  }

  getDependents(filePath: string): Set<string> {
    // get absolute file path
    filePath = path.resolve(filePath);
    const dependents = new Set<string>();
    for (const [node, edges] of this.nodes.entries()) {
      if (edges.has(filePath)) {
        dependents.add(node);
      }
    }
    return dependents;
  }

  save(filePath: string, projectDir: string = '') {
    projectDir = path.resolve(projectDir);
    const nodesArr = [...this.nodes];
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
