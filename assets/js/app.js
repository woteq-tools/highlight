/* ==========================================================================
   Syntax Highlighter — Woteq Tools
   Pure client-side highlighting with a bundled copy of Highlight.js.
   ========================================================================== */

(function () {
	'use strict';

	var VENDOR = 'assets/vendor';
	var MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", "Courier New", monospace';
	var FALLBACK_LANGUAGE = 'javascript';
	var COPY_FALLBACK_LANGUAGE = 'plaintext';

	var languages = window.HLJS_LANGUAGES || [];

	var el = {
		themeStylesheet: document.getElementById('themeStylesheet'),
		langCombo: document.getElementById('langCombo'),
		langToggle: document.getElementById('langToggle'),
		langValue: document.getElementById('langValue'),
		langMenu: document.getElementById('langMenu'),
		langSearch: document.getElementById('langSearch'),
		langList: document.getElementById('langList'),
		langEmpty: document.getElementById('langEmpty'),
		theme: document.getElementById('theme'),
		numbers: document.getElementById('numbers'),
		codeInput: document.getElementById('codeInput'),
		codeOutput: document.getElementById('codeOutput'),
		htmlOutput: document.getElementById('htmlOutput'),
		mdOutput: document.getElementById('mdOutput'),
		preview: document.getElementById('preview'),
		sampleBtn: document.getElementById('sampleBtn'),
		clearBtn: document.getElementById('clearBtn'),
		copyPreviewBtn: document.getElementById('copyPreviewBtn'),
		copyFormatBtn: document.getElementById('copyFormatBtn'),
		toast: document.getElementById('toast'),
		tabs: {
			preview: document.getElementById('tab-preview'),
			html: document.getElementById('tab-html'),
			markdown: document.getElementById('tab-markdown')
		},
		panels: {
			preview: document.getElementById('panel-preview'),
			html: document.getElementById('panel-html'),
			markdown: document.getElementById('panel-markdown')
		}
	};

	var state = {
		language: FALLBACK_LANGUAGE,
		languageFromUrl: false,
		theme: 'default',
		numbers: false,
		tab: 'preview'
	};

	var languagePromises = {};
	var styleCache = {};
	var renderTimer = null;
	var toastTimer = null;
	var renderToken = 0;

	/* ──────────────────────────────────────────────────────────────────────
	   URL state
	   ────────────────────────────────────────────────────────────────────── */

	var aliasMap = buildAliasMap();

	function buildAliasMap() {
		var map = {};
		languages.forEach(function (lang) {
			(lang.aliases || []).forEach(function (alias) {
				map[alias.toLowerCase()] = lang.id;
			});
		});
		// Aliases shipped by Highlight.js that are not part of the file headers.
		var extra = {
			'js': 'javascript', 'ts': 'typescript', 'py': 'python', 'rb': 'ruby',
			'c++': 'cpp', 'c#': 'csharp', 'golang': 'go', 'rs': 'rust',
			'sh': 'bash', 'shell': 'bash', 'yml': 'yaml', 'html': 'xml',
			'htm': 'xml', 'md': 'markdown', 'kt': 'kotlin', 'objc': 'objectivec',
			'obj-c': 'objectivec', 'text': 'plaintext', 'txt': 'plaintext',
			'c++/cli': 'cpp', 'shell-script': 'bash', 'make': 'makefile',
			'postgres': 'pgsql', 'postgresql': 'pgsql', 'docker': 'dockerfile',
			'f#': 'fsharp', 'ps1': 'powershell', 'pwsh': 'powershell',
			'objective-c': 'objectivec', 'vb.net': 'vbnet', 'vbs': 'vbscript'
		};
		Object.keys(extra).forEach(function (key) {
			if (!map[key]) { map[key] = extra[key]; }
		});
		return map;
	}

	function resolveLanguageId(value) {
		if (!value) { return null; }
		var id = value.toLowerCase();
		for (var i = 0; i < languages.length; i++) {
			if (languages[i].id === id) { return languages[i].id; }
		}
		if (aliasMap[id]) { return aliasMap[id]; }
		return null;
	}

	function readUrlState() {
		var params = new URLSearchParams(window.location.search);

		var language = resolveLanguageId(params.get('language'));
		if (language) {
			state.language = language;
			state.languageFromUrl = true;
		}

		var theme = params.get('theme');
		if (theme && hasTheme(theme)) { state.theme = theme; }

		var numbers = params.get('numbers');
		state.numbers = !!(numbers && numbers !== '0' && numbers !== 'false');
	}

	function hasTheme(name) {
		return Array.prototype.some.call(el.theme.options, function (option) {
			return option.value === name;
		});
	}

	function writeUrlState() {
		var url = new URL(window.location.href);
		url.searchParams.set('language', state.language);
		url.searchParams.set('theme', state.theme);
		if (state.numbers) {
			url.searchParams.set('numbers', '1');
		} else {
			url.searchParams.delete('numbers');
		}
		window.history.replaceState({}, '', url);
	}

	/* ──────────────────────────────────────────────────────────────────────
	   Theme + grammar loading
	   ────────────────────────────────────────────────────────────────────── */

	function ensureTheme(theme) {
		var link = el.themeStylesheet;
		if (link.dataset.theme === theme) { return Promise.resolve(); }

		var href = VENDOR + '/styles/' + theme + '.min.css';

		// The very same file may already be applied — re-assigning an identical
		// href does not fire a load event, so resolve straight away.
		if (link.href === new URL(href, window.location.href).href) {
			link.dataset.theme = theme;
			if (link.sheet) { return Promise.resolve(); }
			// Still loading — wait for it, otherwise the colours would be read too early.
			return new Promise(function (resolve) {
				var timer = setTimeout(resolve, 1500);
				link.addEventListener('load', function handler() {
					clearTimeout(timer);
					link.removeEventListener('load', handler);
					resolve();
				}, { once: true });
			});
		}

		return new Promise(function (resolve) {
			var settled = false;
			function done() {
				if (settled) { return; }
				settled = true;
				link.removeEventListener('load', done);
				link.removeEventListener('error', done);
				clearTimeout(timer);
				resolve();
			}
			var timer = setTimeout(done, 1500);
			link.addEventListener('load', done);
			link.addEventListener('error', done);
			link.dataset.theme = theme;
			link.href = href;
		});
	}

	function ensureLanguage(language) {
		if (window.hljs && hljs.getLanguage(language)) { return Promise.resolve(); }
		if (languagePromises[language]) { return languagePromises[language]; }

		languagePromises[language] = new Promise(function (resolve, reject) {
			var script = document.createElement('script');
			script.src = VENDOR + '/languages/' + language + '.min.js';
			script.onload = function () { resolve(); };
			script.onerror = function () {
				delete languagePromises[language];
				reject(new Error('Could not load the "' + language + '" grammar.'));
			};
			document.head.appendChild(script);
		});

		return languagePromises[language];
	}

	/* ──────────────────────────────────────────────────────────────────────
	   Highlighting
	   ────────────────────────────────────────────────────────────────────── */

	function highlightElement(target, code, language) {
		target.removeAttribute('data-highlighted');
		target.className = 'language-' + language;
		target.textContent = code;

		try {
			hljs.highlightElement(target);
		} catch (error) {
			target.className = 'language-' + COPY_FALLBACK_LANGUAGE;
			target.textContent = code;
		}
	}

	/**
	 * Splits highlighted markup into one string per source line.
	 * Spans that cross a line boundary (block comments, template literals)
	 * are closed and reopened so every line stays valid HTML.
	 */
	function splitIntoLines(node) {
		var lines = [''];
		var stack = [];

		function push(text) {
			lines[lines.length - 1] += text;
		}

		function closeOpenTags() {
			for (var i = stack.length - 1; i >= 0; i--) {
				push('</' + stack[i].tag + '>');
			}
		}

		function reopenTags() {
			for (var j = 0; j < stack.length; j++) {
				push('<' + stack[j].tag + stack[j].attrs + '>');
			}
		}

		function walk(current) {
			for (var i = 0; i < current.childNodes.length; i++) {
				var child = current.childNodes[i];

				if (child.nodeType === Node.TEXT_NODE) {
					var parts = child.textContent.split('\n');
					for (var p = 0; p < parts.length; p++) {
						if (p > 0) {
							closeOpenTags();
							lines.push('');
							reopenTags();
						}
						push(escapeHtml(parts[p]));
					}
				} else if (child.nodeType === Node.ELEMENT_NODE) {
					var tag = child.tagName.toLowerCase();
					var attrs = '';
					for (var a = 0; a < child.attributes.length; a++) {
						attrs += ' ' + child.attributes[a].name + '="' +
							escapeAttribute(child.attributes[a].value) + '"';
					}
					stack.push({ tag: tag, attrs: attrs });
					push('<' + tag + attrs + '>');
					walk(child);
					stack.pop();
					push('</' + tag + '>');
				}
			}
		}

		walk(node);
		return lines;
	}

	function applyLineNumbers(target) {
		var lines = splitIntoLines(target);
		var html = '';
		for (var i = 0; i < lines.length; i++) {
			html += '<li>' + lines[i] + '</li>';
		}
		target.innerHTML = '<ol class="code-lines">' + html + '</ol>';
	}

	/* ──────────────────────────────────────────────────────────────────────
	   Serialising the highlighted result as standalone HTML
	   ────────────────────────────────────────────────────────────────────── */

	function inlineStyleFor(node) {
		var parentClass = node.parentNode && node.parentNode.className
			? String(node.parentNode.className)
			: '';
		var key = parentClass + '|' + (node.className || node.tagName);

		if (Object.prototype.hasOwnProperty.call(styleCache, key)) {
			return styleCache[key];
		}

		var computed = window.getComputedStyle(node);
		var style = '';

		var color = computed.color;
		if (color && color !== 'rgba(0, 0, 0, 0)') { style += 'color:' + color + ';'; }

		var background = computed.backgroundColor;
		if (background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') {
			style += 'background-color:' + background + ';';
		}

		if (computed.fontStyle && computed.fontStyle !== 'normal') {
			style += 'font-style:' + computed.fontStyle + ';';
		}

		var weight = computed.fontWeight;
		if (weight && weight !== 'normal' && weight !== '400') {
			style += 'font-weight:' + weight + ';';
		}

		if (computed.textDecorationLine && computed.textDecorationLine !== 'none') {
			style += 'text-decoration:' + computed.textDecorationLine + ';';
		}

		styleCache[key] = style;
		return style;
	}

	function serializeChildren(node) {
		var out = [];

		for (var i = 0; i < node.childNodes.length; i++) {
			var child = node.childNodes[i];

			if (child.nodeType === Node.TEXT_NODE) {
				out.push(escapeHtml(child.textContent));
				continue;
			}

			if (child.nodeType !== Node.ELEMENT_NODE) { continue; }

			var tag = child.tagName.toLowerCase();
			var style = '';

			if (tag === 'ol') {
				style = 'margin:0;padding-left:3.4em;list-style:decimal;';
			} else if (tag === 'li') {
				style = 'margin:0;padding:0;';
			} else {
				style = inlineStyleFor(child);
			}

			out.push('<' + tag + (style ? ' style="' + escapeAttribute(style) + '"' : '') + '>');
			out.push(serializeChildren(child));
			out.push('</' + tag + '>');
		}

		return out.join('');
	}

	function buildHtmlOutput() {
		var root = el.codeOutput;
		var computed = window.getComputedStyle(root);
		var container = window.getComputedStyle(el.preview);

		var foreground = computed.color;
		var background = container.backgroundColor;

		var preStyle = 'font-family:' + MONO + ';';
		if (background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent') {
			preStyle += 'background-color:' + background + ';';
		}
		if (foreground) { preStyle += 'color:' + foreground + ';'; }
		preStyle += 'padding:1em;border-radius:8px;overflow:auto;white-space:pre;line-height:1.5;';

		var inner = serializeChildren(root);

		if (state.numbers) {
			return '<pre style="' + preStyle + '">' + inner + '</pre>';
		}

		return '<pre style="' + preStyle + '"><code style="font-family:inherit;' +
			'background:transparent;' + (foreground ? 'color:' + foreground + ';' : '') +
			'">' + inner + '</code></pre>';
	}

	function buildMarkdownOutput(code) {
		return '```' + state.language + '\n' + code + '\n```';
	}

	function escapeHtml(text) {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function escapeAttribute(text) {
		return text
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	/* ──────────────────────────────────────────────────────────────────────
	   Rendering
	   ────────────────────────────────────────────────────────────────────── */

	function render() {
		var token = ++renderToken;
		var language = state.language;
		var theme = state.theme;
		var code = el.codeInput.value;

		styleCache = {};

		return Promise.all([
			ensureLanguage(language).catch(function () {
				state.language = COPY_FALLBACK_LANGUAGE;
				return null;
			}),
			ensureTheme(theme)
		]).then(function () {
			if (token !== renderToken) { return; }

			if (state.language !== language) { language = state.language; }

			highlightElement(el.codeOutput, code, language);

			if (state.numbers) {
				applyLineNumbers(el.codeOutput);
			}

			var computed = window.getComputedStyle(el.codeOutput);
			var container = window.getComputedStyle(el.preview);
			el.codeOutput.style.setProperty('--code-fg', computed.color);
			el.codeOutput.style.setProperty('--code-bg', container.backgroundColor);

			el.htmlOutput.value = buildHtmlOutput();
			el.mdOutput.value = buildMarkdownOutput(code);
		});
	}

	function scheduleRender() {
		window.clearTimeout(renderTimer);
		renderTimer = window.setTimeout(render, 160);
	}

	/* ──────────────────────────────────────────────────────────────────────
	   Language combo box
	   ────────────────────────────────────────────────────────────────────── */

	function languageLabel(id) {
		for (var i = 0; i < languages.length; i++) {
			if (languages[i].id === id) { return languages[i].name; }
		}
		return id;
	}

	function updateComboLabel() {
		el.langValue.textContent = languageLabel(state.language);
	}

	function buildLanguageList(filter) {
		var query = (filter || '').trim().toLowerCase();
		var fragment = document.createDocumentFragment();
		var shown = 0;

		languages.forEach(function (language) {
			if (query) {
				var haystack = (language.name + ' ' + language.id + ' ' +
					(language.aliases || []).join(' ')).toLowerCase();
				if (haystack.indexOf(query) === -1) { return; }
			}

			shown++;

			var item = document.createElement('li');
			item.setAttribute('role', 'option');
			item.dataset.id = language.id;
			item.setAttribute('aria-selected', language.id === state.language ? 'true' : 'false');
			if (language.id === state.language) { item.className = 'is-selected'; }

			var name = document.createElement('span');
			name.textContent = language.name;
			item.appendChild(name);

			if (language.id !== language.name) {
				var identifier = document.createElement('span');
				identifier.className = 'combo-id';
				identifier.textContent = language.id;
				item.appendChild(identifier);
			}

			fragment.appendChild(item);
		});

		el.langList.replaceChildren(fragment);
		el.langEmpty.hidden = shown > 0;
	}

	function openCombo() {
		el.langMenu.hidden = false;
		el.langCombo.classList.add('is-open');
		el.langToggle.setAttribute('aria-expanded', 'true');
		el.langSearch.value = '';
		buildLanguageList('');
		el.langSearch.focus();
	}

	function closeCombo() {
		el.langMenu.hidden = true;
		el.langCombo.classList.remove('is-open');
		el.langToggle.setAttribute('aria-expanded', 'false');
	}

	function setLanguage(id) {
		if (!id || id === state.language) { closeCombo(); return; }
		state.language = id;
		updateComboLabel();
		closeCombo();
		writeUrlState();
		render();
	}

	function moveActive(step) {
		var items = Array.prototype.filter.call(el.langList.children, function (item) {
			return item.offsetParent !== null;
		});
		if (!items.length) { return; }

		var current = items.findIndex(function (item) {
			return item.classList.contains('is-active');
		});
		var next = current + step;

		if (current !== -1) { items[current].classList.remove('is-active'); }

		if (next < 0) { next = items.length - 1; }
		if (next >= items.length) { next = 0; }

		items[next].classList.add('is-active');
		items[next].scrollIntoView({ block: 'nearest' });
	}

	/* ──────────────────────────────────────────────────────────────────────
	   Tabs
	   ────────────────────────────────────────────────────────────────────── */

	function selectTab(name) {
		state.tab = name;

		Object.keys(el.tabs).forEach(function (key) {
			var active = key === name;
			el.tabs[key].classList.toggle('is-active', active);
			el.tabs[key].setAttribute('aria-selected', active ? 'true' : 'false');
			el.panels[key].hidden = !active;
		});

		el.copyFormatBtn.textContent = name === 'markdown' ? 'Copy Markdown' : 'Copy HTML';
	}

	/* ──────────────────────────────────────────────────────────────────────
	   Clipboard + toast
	   ────────────────────────────────────────────────────────────────────── */

	function showToast(message) {
		el.toast.textContent = message;
		el.toast.classList.add('is-visible');
		window.clearTimeout(toastTimer);
		toastTimer = window.setTimeout(function () {
			el.toast.classList.remove('is-visible');
		}, 1900);
	}

	function copyText(text) {
		if (navigator.clipboard && window.isSecureContext) {
			return navigator.clipboard.writeText(text);
		}

		return new Promise(function (resolve, reject) {
			var area = document.createElement('textarea');
			area.value = text;
			area.setAttribute('readonly', '');
			area.style.position = 'fixed';
			area.style.top = '-1000px';
			area.style.opacity = '0';
			document.body.appendChild(area);
			area.select();

			var ok = false;
			try {
				ok = document.execCommand('copy');
			} catch (error) {
				ok = false;
			}
			document.body.removeChild(area);
			ok ? resolve() : reject(new Error('Copying is not supported here.'));
		});
	}

	function copyAndReport(text, label) {
		copyText(text).then(function () {
			showToast(label + ' copied to clipboard');
		}).catch(function () {
			showToast('Could not copy — select the text and copy manually');
		});
	}

	/* ──────────────────────────────────────────────────────────────────────
	   Samples
	   ────────────────────────────────────────────────────────────────────── */

	var SAMPLES = {
		c: [
			'#include <stdio.h>',
			'',
			'/* Fibonacci numbers, up to a given limit. */',
			'static void print_fib(long limit) {',
			'\tlong a = 0, b = 1;',
			'',
			'\twhile (a <= limit) {',
			'\t\tprintf("%ld\\n", a);',
			'\t\tlong next = a + b;',
			'\t\ta = b;',
			'\t\tb = next;',
			'\t}',
			'}',
			'',
			'int main(void) {',
			'\tprint_fib(100);',
			'\treturn 0;',
			'}'
		],
		cpp: [
			'#include <iostream>',
			'#include <vector>',
			'',
			'// A tiny, but useful, string helper.',
			'std::string shout(std::string text) {',
			'\tfor (char &c : text) {',
			'\t\tc = static_cast<char>(std::toupper(c));',
			'\t}',
			'\treturn text + "!";',
			'}',
			'',
			'int main() {',
			'\tstd::cout << shout("hello world") << std::endl;',
			'\treturn 0;',
			'}'
		],
		csharp: [
			'using System;',
			'using System.Collections.Generic;',
			'',
			'namespace Store',
			'{',
			'\tpublic class Cart',
			'\t{',
			'\t\tprivate readonly List<string> _items = new();',
			'',
			'\t\tpublic void Add(string item) => _items.Add(item);',
			'',
			'\t\tpublic IEnumerable<string> Items => _items;',
			'\t}',
			'}'
		],
		java: [
			'import java.util.List;',
			'import java.util.stream.Collectors;',
			'',
			'public class Names {',
			'\tpublic static void main(String[] args) {',
			'\t\tList<String> names = List.of("Ada", "Grace", "Linus");',
			'',
			'\t\tString upper = names.stream()',
			'\t\t\t\t.map(String::toUpperCase)',
			'\t\t\t\t.collect(Collectors.joining(", "));',
			'',
			'\t\tSystem.out.println(upper);',
			'\t}',
			'}'
		],
		javascript: [
			'// Fetch a list of repositories and print the busiest ones.',
			'async function topRepos(user, count = 3) {',
			'\tconst response = await fetch(`https://api.github.com/users/${user}/repos`);',
			'',
			'\tif (!response.ok) {',
			'\t\tthrow new Error(`Request failed: ${response.status}`);',
			'\t}',
			'',
			'\treturn response',
			'\t\t.json()',
			'\t\t.then((repos) => repos.sort((a, b) => b.stargazers_count - a.stargazers_count))',
			'\t\t.slice(0, count);',
			'}',
			'',
			'topRepos("woteq-tools").then(console.log);'
		],
		typescript: [
			'interface Repository {',
			'\tname: string;',
			'\tstargazers_count: number;',
			'\tlanguage: string | null;',
			'}',
			'',
			'export function topRepos(repos: Repository[], count = 3): Repository[] {',
			'\treturn [...repos]',
			'\t\t.sort((a, b) => b.stargazers_count - a.stargazers_count)',
			'\t\t.slice(0, count);',
			'}'
		],
		python: [
			'"""Group words by their length."""',
			'',
			'from collections import defaultdict',
			'',
			'',
			'def group_by_length(words: list[str]) -> dict[int, list[str]]:',
			'\tgroups = defaultdict(list)',
			'\tfor word in words:',
			'\t\tgroups[len(word)].append(word)',
			'\treturn dict(groups)',
			'',
			'',
			'if __name__ == "__main__":',
			'\tprint(group_by_length(["code", "is", "fun", "python"]))'
		],
		go: [
			'package main',
			'',
			'import (',
			'\t"fmt"',
			'\t"sort"',
			')',
			'',
			'func main() {',
			'\twords := []string{"go", "golang", "gopher"}',
			'\tsort.Strings(words)',
			'',
			'\tfor i, word := range words {',
			'\t\tfmt.Printf("%d. %s\\n", i+1, word)',
			'\t}',
			'}'
		],
		rust: [
			'use std::collections::HashMap;',
			'',
			'fn main() {',
			'\tlet text = "the quick brown fox jumps over the lazy dog";',
			'\tlet mut counts: HashMap<&str, usize> = HashMap::new();',
			'',
			'\tfor word in text.split_whitespace() {',
			'\t\t*counts.entry(word).or_insert(0) += 1;',
			'\t}',
			'',
			'\tfor (word, count) in &counts {',
			'\t\tprintln!("{word}: {count}");',
			'\t}',
			'}'
		],
		ruby: [
			'# Freeze a string and count its characters.',
			'def character_counts(text)',
			'\ttext.chars.tally',
			'end',
			'',
			'counts = character_counts("hello woteq")',
			'',
			'counts.each do |char, count|',
			'\tputs "#{char}: #{count}"',
			'end'
		],
		php: [
			'<?php',
			'',
			'declare(strict_types=1);',
			'',
			'function slugify(string $title): string',
			'{',
			'\t$slug = strtolower($title);',
			'\t$slug = preg_replace(\'/[^a-z0-9]+/\', \'-\', $slug);',
			'',
			'\treturn trim($slug, \'-\');',
			'}',
			'',
			'echo slugify(\'Hello, Woteq Tools!\'), PHP_EOL;'
		],
		sql: [
			'-- Most active authors in the last 30 days.',
			'SELECT',
			'    a.name,',
			'    COUNT(DISTINCT p.id) AS post_count',
			'FROM authors a',
			'JOIN posts p ON p.author_id = a.id',
			'WHERE p.created_at >= NOW() - INTERVAL \'30 days\'',
			'GROUP BY a.id, a.name',
			'HAVING COUNT(DISTINCT p.id) > 0',
			'ORDER BY post_count DESC',
			'LIMIT 10;'
		],
		bash: [
			'#!/usr/bin/env bash',
			'set -euo pipefail',
			'',
			'# Publish the current branch to GitHub Pages.',
			'branch="$(git rev-parse --abbrev-ref HEAD)"',
			'',
			'if [[ "$branch" != "main" ]]; then',
			'\techo "Not on main — skipping."',
			'\texit 0',
			'fi',
			'',
			'git push origin main',
			'echo "Published $branch."'
		],
		shell: [
			'$ ls -la',
			'total 8',
			'drwxr-xr-x  2 user  staff  64 Nov 17 13:43 .',
			'',
			'$ echo "hello from woteq"',
			'hello from woteq'
		],
		xml: [
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<tool name="syntax-highlighter">',
			'\t<language>xml</language>',
			'\t<offline>true</offline>',
			'',
			'\t<description>',
			'\t\tHighlight your source code without uploading anything.',
			'\t</description>',
			'</tool>'
		],
		yaml: [
			'name: syntax-highlighter',
			'version: 1.0.0',
			'description: Highlight your source code without uploading anything.',
			'',
			'features:',
			'  - offline',
			'  - many-languages',
			'  - copy-as-html',
			'',
			'options:',
			'  lineNumbers: false'
		],
		json: [
			'{',
			'\t"name": "syntax-highlighter",',
			'\t"private": true,',
			'\t"type": "module",',
			'\t"scripts": {',
			'\t\t"deploy": "gh workflow run deploy-pages.yml"',
			'\t},',
			'\t"dependencies": {',
			'\t\t"highlight.js": "^11.11.1"',
			'\t}',
			'}'
		],
		css: [
			':root {',
			'\t--accent: #4f46e5;',
			'\t--radius: 12px;',
			'}',
			'',
			'.card {',
			'\tbackground: #fff;',
			'\tborder: 1px solid #e2e5ef;',
			'\tborder-radius: var(--radius);',
			'\tpadding: 20px;',
			'}',
			'',
			'.card:hover {',
			'\tbox-shadow: 0 8px 24px rgba(16, 18, 28, .12);',
			'}'
		],
		kotlin: [
			'data class User(val name: String, val repos: Int)',
			'',
			'fun main() {',
			'\tval users = listOf(',
			'\t\tUser("woteq-tools", 12),',
			'\t\tUser("opencode", 8)',
			'\t)',
			'',
			'\tusers.sortedByDescending { it.repos }',
			'\t\t.forEach { println("${it.name}: ${it.repos}") }',
			'}'
		],
		swift: [
			'import Foundation',
			'',
			'struct Repository {',
			'\tlet name: String',
			'\tlet stars: Int',
			'}',
			'',
			'let repositories = [',
			'\tRepository(name: "woteq-tools", stars: 12),',
			'\tRepository(name: "opencode", stars: 8)',
			']',
			'',
			'for repo in repositories.sorted(by: { $0.stars > $1.stars }) {',
			'\tprint("\\(repo.name): \\(repo.stars)")',
			'}'
		],
		lua: [
			'-- Count words in a string.',
			'local function count_words(text)',
			'\tlocal counts = {}',
			'',
			'\tfor word in text:gmatch("%S+") do',
			'\t\tcounts[word] = (counts[word] or 0) + 1',
			'\tend',
			'',
			'\treturn counts',
			'end',
			'',
			'for word, count in pairs(count_words("hello hello woteq")) do',
			'\tprint(word, count)',
			'end'
		],
		r: [
			'# Plot a simple line, then fit a model to it.',
			'x <- seq(0, 10, by = 0.5)',
			'y <- 2 * x + rnorm(length(x))',
			'',
			'fit <- lm(y ~ x)',
			'',
			'plot(x, y,',
			'\t main = "Scatter with a fitted line",',
			'\t xlab = "x", ylab = "y")',
			'abline(fit, col = "steelblue", lwd = 2)'
		]
	};

	var GENERIC_SAMPLE = [
		'// Write your code here.',
		'// The preview updates as you type.',
		'',
		'function greet(name) {',
		'\treturn `Hello, ${name}!`;',
		'}',
		'',
		'console.log(greet("Woteq"));'
	];

	function loadSample() {
		var sample = SAMPLES[state.language] || SAMPLES[resolveLanguageId(state.language) || ''] || GENERIC_SAMPLE;
		el.codeInput.value = sample.join('\n');
		el.codeInput.focus();
		render();
	}

	/* ──────────────────────────────────────────────────────────────────────
	   Wiring
	   ────────────────────────────────────────────────────────────────────── */

	function init() {
		readUrlState();

		el.theme.value = state.theme;
		el.numbers.checked = state.numbers;
		updateComboLabel();
		buildLanguageList('');
		selectTab('preview');

		el.langToggle.addEventListener('click', function () {
			if (el.langMenu.hidden) {
				openCombo();
			} else {
				closeCombo();
			}
		});

		el.langSearch.addEventListener('input', function () {
			buildLanguageList(this.value);
		});

		el.langSearch.addEventListener('keydown', function (event) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				moveActive(1);
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				moveActive(-1);
			} else if (event.key === 'Enter') {
				event.preventDefault();
				var active = el.langList.querySelector('.is-active') ||
					el.langList.querySelector('li');
				if (active) { setLanguage(active.dataset.id); }
			} else if (event.key === 'Escape') {
				event.preventDefault();
				closeCombo();
				el.langToggle.focus();
			}
		});

		el.langList.addEventListener('click', function (event) {
			var item = event.target.closest('li');
			if (item && item.dataset.id) { setLanguage(item.dataset.id); }
		});

		document.addEventListener('click', function (event) {
			if (el.langMenu.hidden) { return; }
			if (!el.langCombo.contains(event.target)) { closeCombo(); }
		});

		el.theme.addEventListener('change', function () {
			state.theme = this.value;
			writeUrlState();
			render();
		});

		el.numbers.addEventListener('change', function () {
			state.numbers = this.checked;
			writeUrlState();
			render();
		});

		el.codeInput.addEventListener('input', scheduleRender);

		el.codeInput.addEventListener('keydown', function (event) {
			if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
				event.preventDefault();
				window.clearTimeout(renderTimer);
				render();
			}
		});

		el.sampleBtn.addEventListener('click', loadSample);

		el.clearBtn.addEventListener('click', function () {
			el.codeInput.value = '';
			el.codeInput.focus();
			render();
		});

		Object.keys(el.tabs).forEach(function (key) {
			el.tabs[key].addEventListener('click', function () {
				selectTab(key);
			});
		});

		el.copyPreviewBtn.addEventListener('click', function () {
			copyAndReport(el.codeInput.value, 'Source code');
		});

		el.copyFormatBtn.addEventListener('click', function () {
			if (state.tab === 'markdown') {
				copyAndReport(el.mdOutput.value, 'Markdown block');
			} else {
				copyAndReport(el.htmlOutput.value, 'HTML');
			}
		});

		window.addEventListener('popstate', function () {
			readUrlState();
			el.theme.value = state.theme;
			el.numbers.checked = state.numbers;
			updateComboLabel();
			render();
		});

		// First paint: show a sample that matches the requested language.
		el.codeInput.value = (SAMPLES[state.language] || SAMPLES[FALLBACK_LANGUAGE]).join('\n');

		ensureTheme(state.theme).then(function () {
			return render();
		}).then(function () {
			// Normalise the URL so it always reflects the state that is really in use.
			writeUrlState();
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
