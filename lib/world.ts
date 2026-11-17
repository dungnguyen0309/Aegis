import type { FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;

/** World countries (Natural Earth 1:110m), decoded once for the flat corridor map and the globe. */
export const COUNTRIES = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features;
